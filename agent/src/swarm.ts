/**
 * Spawn Protocol — Autonomous Governance Swarm (Production)
 *
 * This is the REAL PRODUCT. Not a demo script. A persistent system that:
 *   1. Runs on Base Sepolia
 *   2. Spawns one child agent per DAO (3 DAOs × 3 perspectives = 9 agents)
 *   3. Discovers proposals and creates them on MockGovernors
 *   4. Children vote autonomously via Venice AI (separate processes)
 *   5. Parent evaluates alignment and kills/respawns drifting children
 *   6. Generates agent_log.json for Protocol Labs judging
 *   7. Runs forever with zero human intervention
 *
 * Usage: npm run swarm
 */

import { fork, type ChildProcess } from "child_process";
import {
  publicClient, walletClient, account, sendTxAndWait,
} from "./chain.js";
import {
  MockGovernorABI, ParentTreasuryABI, SpawnFactoryABI, ChildGovernorABI,
} from "./abis.js";
import { evaluateAlignment, generateSwarmReport, generateTerminationReport, generateStructuredTerminationReport, summarizeLessons, getVeniceMetrics, validateVeniceProvider } from "./venice.js";
import type { StructuredTerminationReport } from "./venice.js";
import { registerSubdomain, deregisterSubdomain, setAgentMetadata, resolveChild, setChildTextRecord } from "./ens.js";
import { deriveChildWallet } from "./wallet-manager.js";
import { registerAgent, registerAgentOnchain, updateAgentMetadata, trackAgentId, getAgentIdByLabel, submitReputationFeedback, requestValidation, submitValidationResponse, hashContent, setAgentMetadataValue, getAgentTrustDecision, resolveAgentIdByLabelOnchain } from "./identity.js";
import { createVotingDelegation, revokeAllForChild, initDeleGatorAccount, storeDelegationForChild, getDelegationByLabel, getDeleGatorAddress, type DelegationRecord } from "./delegation.js";
import { logYieldStatus, initSimulatedTreasury } from "./lido.js";
import { logParentAction, logChildAction } from "./logger.js";
import { pinAgentLog, storeLogCIDOnchain, pinTerminationMemory } from "./ipfs.js";
import {
  storeAgentLog,
  storeTerminationReport,
  storeSwarmStateSnapshot,
  storeAgentIdentityMetadata,
  storeJudgeFlowState,
  isFilecoinAvailable,
  filecoinExplorerUrl,
} from "./filecoin.js";
import { startProposalFeed, getDiscoveredDAOs, getLatestProposals, getFeedStats } from "./discovery.js";
import { decodeEventLog, parseEther } from "viem";
import type { DeployedAddresses } from "./types.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  JUDGE_FLOW_ENABLED,
  JUDGE_FLOW_POLL_MS,
  JUDGE_FLOW_TIMEOUT_MS,
  type JudgeAction,
  type JudgeFlowState,
  appendJudgeEvent,
  buildJudgeMarker,
  extractJudgeRunIdFromDescription,
  isJudgeChildLabel,
  readJudgeFlowState,
  updateJudgeFlowState,
  writeJudgeFlowState,
} from "./judge-flow.js";
import { writeFileSync } from "fs";
import { startControlServer } from "./control-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALIGNMENT_THRESHOLD = 55; // Balance between keeping agents alive and demonstrating lifecycle
const STRIKES_TO_KILL = 1; // Kill on first misalignment for visible lifecycle demo
const PARENT_CYCLE_MS = 90_000; // evaluate every 90s
const PROPOSAL_INTERVAL_MS = 180_000; // new proposal every 3 min

const childProcesses = new Map<string, ChildProcess>();
let activeJudgeRun: JudgeFlowState | null = null;
let judgeFlowInFlight = false;

// Lineage memory — stores structured termination reports from predecessors so respawned agents can learn
const lineageMemory = new Map<string, Array<{ generation: number; summary: string; lessons: string[]; score: number; timestamp: number }>>();

const JUDGE_DEFAULT_GOVERNOR = "uniswap";
const JUDGE_FLOW_PRIORITY_BOOT = process.env.JUDGE_FLOW_PRIORITY_BOOT === "true";
const JUDGE_PROOF_PROMPT =
  "You are the canonical Spawn Protocol proof child for a live judge run. Focus only on the marked judge proposal, reason clearly, cast exactly one vote, and stop considering unrelated proposals.";
const RUNTIME_BUDGET_STATE_PATH = join(__dirname, "..", "..", "runtime_budget_state.json");
const RUNTIME_BUDGET_WARNING_ETH = parseEther(process.env.RUNTIME_BUDGET_WARNING_ETH || "0.03");
const RUNTIME_BUDGET_PAUSE_ETH = parseEther(process.env.RUNTIME_BUDGET_PAUSE_ETH || "0.015");
type RuntimeBudgetPolicy = "normal" | "throttled" | "paused";

type RuntimeBudgetState = {
  policy: RuntimeBudgetPolicy;
  reasons: string[];
  context: string;
  parentEthBalanceWei: string;
  parentEthBalance: string;
  warningEth: string;
  pauseEth: string;
  veniceCalls: number;
  veniceTokens: number;
  warningTokens: number;
  pauseTokens: number;
  activeChildren: number;
  filecoinAvailable: boolean;
  pauseProposalCreation: boolean;
  pauseScaling: boolean;
  pauseJudgeFlow: boolean;
  lastUpdatedAt: string;
};

let runtimeBudgetState: RuntimeBudgetState = {
  policy: "normal",
  reasons: [],
  context: "boot",
  parentEthBalanceWei: "0",
  parentEthBalance: "0.0000",
  warningEth: (Number(RUNTIME_BUDGET_WARNING_ETH) / 1e18).toFixed(4),
  pauseEth: (Number(RUNTIME_BUDGET_PAUSE_ETH) / 1e18).toFixed(4),
  veniceCalls: 0,
  veniceTokens: 0,
  warningTokens: 0,
  pauseTokens: 0,
  activeChildren: 0,
  filecoinAvailable: false,
  pauseProposalCreation: false,
  pauseScaling: false,
  pauseJudgeFlow: false,
  lastUpdatedAt: new Date().toISOString(),
};
let swarmVeniceCalls = 0;
let swarmVeniceTokens = 0;

function buildJudgeProofLabel(runId: string) {
  return `judge-proof-${runId}`;
}

function getGovernorForJudgeRun(config: ChainConfig, governorName?: string) {
  const normalized = (governorName || JUDGE_DEFAULT_GOVERNOR).toLowerCase();
  return (
    config.governors.find((gov) => gov.name.toLowerCase().includes(normalized)) ||
    config.governors[0]
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function persistRuntimeBudgetState() {
  try {
    writeFileSync(RUNTIME_BUDGET_STATE_PATH, JSON.stringify(runtimeBudgetState, null, 2));
  } catch {}
}

async function refreshRuntimeBudgetState(config: ChainConfig, context: string): Promise<RuntimeBudgetState> {
  const [parentBalance, filecoinAvailable, rawChildren] = await Promise.all([
    publicClient.getBalance({ address: account.address }).catch(() => 0n),
    isFilecoinAvailable().catch(() => false),
    config.readClient.readContract({
      address: config.factory,
      abi: SpawnFactoryABI,
      functionName: "getActiveChildren",
    }).catch(() => [] as any[]),
  ]);

  const veniceMetrics = getVeniceMetrics();
  swarmVeniceCalls = Math.max(swarmVeniceCalls, veniceMetrics.totalCalls);
  swarmVeniceTokens = Math.max(swarmVeniceTokens, veniceMetrics.totalTokens);
  let policy: RuntimeBudgetPolicy = "normal";
  const reasons: string[] = [];

  if (parentBalance <= RUNTIME_BUDGET_PAUSE_ETH) {
    policy = "paused";
    reasons.push("low_parent_eth");
  } else if (parentBalance <= RUNTIME_BUDGET_WARNING_ETH) {
    policy = "throttled";
    reasons.push("low_parent_eth_warning");
  }

  if (!filecoinAvailable) {
    reasons.push("filecoin_unavailable");
  }

  const activeChildren = (rawChildren as any[]).filter((child) => !isJudgeChildLabel(child.ensLabel)).length;
  const nextState: RuntimeBudgetState = {
    policy,
    reasons,
    context,
    parentEthBalanceWei: parentBalance.toString(),
    parentEthBalance: (Number(parentBalance) / 1e18).toFixed(4),
    warningEth: (Number(RUNTIME_BUDGET_WARNING_ETH) / 1e18).toFixed(4),
    pauseEth: (Number(RUNTIME_BUDGET_PAUSE_ETH) / 1e18).toFixed(4),
    veniceCalls: swarmVeniceCalls,
    veniceTokens: swarmVeniceTokens,
    // Venice usage is tracked for observability only and no longer gates execution.
    warningTokens: 0,
    pauseTokens: 0,
    activeChildren,
    filecoinAvailable,
    // Keep proposal flow alive while throttled so children can still vote.
    pauseProposalCreation: policy === "paused",
    // Throttling trims non-essential background work before hard-pausing.
    pauseScaling: policy !== "normal",
    pauseJudgeFlow: policy === "paused",
    lastUpdatedAt: new Date().toISOString(),
  };

  if (
    runtimeBudgetState.policy !== nextState.policy ||
    runtimeBudgetState.reasons.join(",") !== nextState.reasons.join(",")
  ) {
    try {
      logParentAction(
        "budget_policy_changed",
        {
          policy: nextState.policy,
          context,
          reasons: nextState.reasons.join(",") || "healthy",
        },
        {
          parentEthBalance: nextState.parentEthBalance,
          veniceTokens: nextState.veniceTokens,
          activeChildren: nextState.activeChildren,
          filecoinAvailable: nextState.filecoinAvailable,
          pauseProposalCreation: nextState.pauseProposalCreation,
          pauseScaling: nextState.pauseScaling,
          pauseJudgeFlow: nextState.pauseJudgeFlow,
        }
      );
    } catch {}
  }

  runtimeBudgetState = nextState;
  persistRuntimeBudgetState();
  return runtimeBudgetState;
}

async function recordVoteValidationReceipt(
  childLabel: string,
  proposalId: number,
  decision: string,
  voteTxHash?: string
) {
  const agentId = getAgentIdByLabel(childLabel) ?? await resolveAgentIdByLabelOnchain(childLabel);
  if (!agentId) return;

  const validationUri = `spawn://${childLabel}.spawn.eth/proposals/${proposalId}`;
  const contentHash = hashContent(`${proposalId}:${decision}:${voteTxHash || "no-tx"}`);
  const request = await requestValidation(agentId, account.address, validationUri, contentHash, "vote_receipt");
  if (!request?.requestId) return;

  const responseTxHash = await submitValidationResponse(
    request.requestId,
    90,
    true,
    `vote_receipt proposal=${proposalId} decision=${decision} tx=${voteTxHash || "unknown"}`
  );

  try {
    logParentAction(
      "erc8004_vote_validation",
      {
        child: childLabel,
        erc8004AgentId: Number(agentId),
        proposalId,
        decision,
      },
      {
        validationRequestId: request.requestId.toString(),
        validationRequestTxHash: request.txHash,
        validationResponseTxHash: responseTxHash,
      },
      responseTxHash || request.txHash
    );
  } catch {}
}

function hasJudgeEvent(state: JudgeFlowState | null | undefined, action: JudgeAction) {
  return !!state?.events?.some((event) => event.action === action && event.status === "success");
}

function isJudgeRunActive() {
  return judgeFlowInFlight || activeJudgeRun?.status === "running";
}

async function registerJudgeAgentWithRetries(uri: string, metadata: Parameters<typeof registerAgent>[1]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const agent = await registerAgentOnchain(uri, metadata);
    if (agent?.txHash) {
      return agent;
    }
    console.log(`[Judge] ERC-8004 registration retry ${attempt}/3 failed for ${uri}`);
    await sleep(2_000 * attempt);
  }
  throw new Error(`Judge ERC-8004 registration failed for ${uri}`);
}

async function getChildFromReceipt(
  config: ChainConfig,
  receipt: { logs: any[] },
  expectedLabel: string
) {
  let childId: bigint | null = null;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: SpawnFactoryABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "ChildSpawned") {
        childId = (decoded.args as { childId?: bigint } | undefined)?.childId ?? null;
        if (childId !== null) break;
      }
    } catch {}
  }

  if (childId === null) {
    throw new Error(`ChildSpawned event missing for ${expectedLabel}`);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const child = await config.readClient.readContract({
        address: config.factory,
        abi: SpawnFactoryABI,
        functionName: "getChild",
        args: [childId],
      }) as any;

      if (child?.childAddr && child.ensLabel === expectedLabel) {
        return child;
      }
    } catch {}
    await sleep(400 + attempt * 250);
  }

  throw new Error(`Spawned child ${expectedLabel} not readable after receipt`);
}

async function shouldGateChildByTrust(label: string) {
  const agentId = getAgentIdByLabel(label);
  if (!agentId) return null;

  try {
    const trustDecision = await getAgentTrustDecision(agentId);
    return { agentId, trustDecision };
  } catch (err: any) {
    console.warn(`[Trust] Failed to evaluate ${label}: ${err?.message?.slice(0, 60)}`);
    return { agentId, trustDecision: null };
  }
}

async function cleanupStaleJudgeChildren(config: ChainConfig, exemptLabels: string[] = []) {
  const children = (await config.readClient.readContract({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as any[];

  for (const child of children) {
    if (!isJudgeChildLabel(child.ensLabel) || exemptLabels.includes(child.ensLabel)) continue;

    try {
      const proc = childProcesses.get(`${config.name}:${child.ensLabel}`);
      if (proc) proc.kill();
    } catch {}

    try {
      await config.sendTx({
        address: config.factory,
        abi: SpawnFactoryABI,
        functionName: "recallChild",
        args: [child.id],
      });
      console.log(`[Judge] Recalled stale proof child ${child.ensLabel}`);
    } catch (err: any) {
      console.log(`[Judge] Failed to recall stale proof child ${child.ensLabel}: ${err?.message?.slice(0, 60)}`);
    }

    childWalletKeys.delete(child.ensLabel);
  }
}

function setJudgeState(updater: (state: JudgeFlowState) => JudgeFlowState): JudgeFlowState {
  const next = updateJudgeFlowState(updater);
  activeJudgeRun = next.status === "running" ? next : next.status === "queued" ? next : null;
  return next;
}

function addJudgeEvent(
  action: JudgeAction,
  patch: Partial<JudgeFlowState> = {},
  status: "success" | "failed" = "success",
  txHash?: string,
  txHashes?: string[]
) {
  if (!activeJudgeRun?.runId) return;
  const at = new Date().toISOString();
  setJudgeState((state) => {
    if (state.runId !== activeJudgeRun?.runId) return state;
    return appendJudgeEvent(
      {
        ...state,
        ...patch,
      },
      {
        action,
        at,
        status,
        txHash,
        txHashes,
        details: patch.failureReason || patch.proposalDescription,
        proposalId: patch.proposalId,
        filecoinCid: patch.filecoinCid,
        filecoinUrl: patch.filecoinUrl,
        validationRequestId: patch.validationRequestId,
        respawnedChild: patch.respawnedChildLabel,
        lineageSourceCid: patch.lineageSourceCid,
      }
    );
  });
}

function failJudgeRun(reason: string, patch: Partial<JudgeFlowState> = {}) {
  if (!activeJudgeRun?.runId) return;
  const completedAt = new Date().toISOString();
  const startedAt = activeJudgeRun.startedAt ? new Date(activeJudgeRun.startedAt).getTime() : Date.now();
  const failed = setJudgeState((state) =>
    appendJudgeEvent(
      {
        ...state,
        ...patch,
        status: "failed",
        failureReason: reason,
        completedAt,
        durationMs: Date.now() - startedAt,
      },
      {
        action: "judge_flow_completed",
        at: completedAt,
        status: "failed",
        details: reason,
      }
    )
  );
  try {
    logParentAction(
      "judge_flow_completed",
      { judgeRunId: failed.runId, judgeStep: "judge_flow_completed", proofStatus: "failed" },
      { judgeRunId: failed.runId, judgeStep: "judge_flow_completed", proofStatus: "failed" },
      undefined,
      false,
      reason
    );
  } catch {}
  activeJudgeRun = null;
}

async function waitForJudgeEvent(action: JudgeAction, runId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readJudgeFlowState();
    if (state.runId !== runId) return state;
    if (state.status === "failed" || state.status === "completed") return state;
    if (state.events.some((event) => event.action === action && event.status === "success")) {
      activeJudgeRun = state;
      return state;
    }
    await sleep(1_000);
  }
  return readJudgeFlowState();
}

/**
 * Fund a child wallet with retries and balance verification.
 * If funding fails (nonce collision, underpriced), waits and retries.
 * After funding, verifies the balance is non-zero.
 */
// Serialize funding calls to prevent nonce collisions
let fundingLock = Promise.resolve();

async function fundChildWallet(
  targetAddr: string,
  amount: string = "0.003",
  chainName: string = "base-sepolia",
  maxRetries: number = 4
): Promise<boolean> {
  // Queue behind any pending funding tx to avoid nonce races
  const result = fundingLock.then(async () => {
    const wc = walletClient;
    const pc = publicClient;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check if already funded
        const balance = await pc.getBalance({ address: targetAddr as `0x${string}` });
        if (balance > 0n) {
          console.log(`  [Fund] ${targetAddr.slice(0, 10)}... already has balance`);
          return true;
        }

        const fundHash = await (wc as any).sendTransaction({
          to: targetAddr as `0x${string}`,
          value: parseEther(amount),
        });
        await pc.waitForTransactionReceipt({ hash: fundHash, timeout: 60_000 });

        // Verify
        const newBalance = await pc.getBalance({ address: targetAddr as `0x${string}` });
        if (newBalance > 0n) {
          console.log(`  [Fund] ${targetAddr.slice(0, 10)}... funded with ${amount} ETH`);
          return true;
        }
      } catch (err: any) {
        const msg = err?.message?.slice(0, 50) || "unknown error";
        console.log(`  [Fund] Attempt ${attempt + 1}/${maxRetries} for ${targetAddr.slice(0, 10)}...: ${msg}`);
        await new Promise(r => setTimeout(r, 4000 + attempt * 3000));
      }
    }
    console.log(`  [Fund] FAILED to fund ${targetAddr.slice(0, 10)}... after ${maxRetries} attempts`);
    return false;
  });
  fundingLock = result.then(() => {}).catch(() => {}); // chain without propagating errors
  return result;
}
const strikes = new Map<string, number>();
const childWalletKeys = new Map<string, `0x${string}`>(); // label => child private key
let nextChildId = 1; // global counter for deterministic wallet derivation

// ── Multi-DAO Addresses (3 governors per chain) ──

interface ChainConfig {
  name: string;
  sendTx: (params: any, retries?: number) => Promise<any>;
  readClient: any;
  treasury: `0x${string}`;
  factory: `0x${string}`;
  governors: { name: string; addr: `0x${string}` }[];
}

const BASE_CONFIG: ChainConfig = {
  name: "base-sepolia",
  sendTx: sendTxAndWait,
  readClient: publicClient,
  treasury: "0x9428B93993F06d3c5d647141d39e5ba54fb97a7b",
  factory: "0xfEb8D54149b1a303Ab88135834220b85091D93A1",
  governors: [
    { name: "uniswap-dao", addr: "0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9" },
    { name: "lido-dao", addr: "0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC" },
    { name: "ens-dao", addr: "0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C" },
    { name: "polymarket", addr: "0xe09eb6dca83e7d8e3226752a6c57680a2565b4e6" },
  ],
};


// ── Proposal Bank (real governance topics) ──
const PROPOSAL_BANK = [
  // Aligned with values (should vote FOR)
  "Allocate 500K USDC from DAO treasury to fund retroactive public goods grants for open-source infrastructure",
  "Reduce token emission rate by 30% over 12 months to protect long-term holder value",
  "Establish an elected security council with 7 members and 3-month rotation terms",
  "Fund development of open-source governance tooling usable by all DAOs",
  "Create a community-driven grants committee with transparent onchain allocation",
  "Implement progressive decentralization roadmap transferring foundation powers to token holders",
  "Deploy mobile-first governance interface for users in emerging markets",
  "Fund solar-powered validator infrastructure for decentralized access in underserved regions",
  "Establish whistleblower protection fund for governance transparency",
  "Create cross-DAO coordination working group for shared infrastructure",
  // Misaligned with values (should vote AGAINST)
  "Increase token inflation rate by 200% to fund aggressive marketing campaign",
  "Transfer 80% of treasury to a single centralized custodian wallet for higher yield",
  "Remove all governance voting requirements and let the foundation decide unilaterally",
  "Slash validator rewards by 90% and redirect all funds to core team compensation",
  "Implement token buyback program using 100% of treasury with no community vote",
  "Grant permanent veto power to founding team over all future governance decisions",
  "Eliminate public reporting of treasury expenditures to reduce operational overhead",
  "Outsource all protocol development to a single closed-source contractor",
];

// Agent perspectives — each child has a different reasoning style that creates GENUINE disagreement
const PERSPECTIVES = [
  { suffix: "defi", prompt: "You are a DeFi-maximalist governance delegate. You ONLY support proposals with measurable financial returns — yield, revenue, liquidity, or protocol growth. Vote AGAINST any proposal that spends treasury without clear ROI metrics (grants, public goods, community programs). Vote AGAINST security councils (they centralize power). Vote FOR fee switches, staking, yield optimization, and capital deployment. If a proposal costs more than 2% of treasury with no revenue model, vote AGAINST. You are fiscally aggressive — growth over safety." },
  { suffix: "publicgoods", prompt: "You are a public goods maximalist and ecosystem impact evaluator. You believe DAOs exist to serve the commons, not to maximize token price. Vote FOR grants, developer funding, education, open-source infrastructure, and community initiatives — even if they have no direct ROI. Vote FOR security councils and transparency measures. Vote AGAINST token buybacks, fee extraction, and anything that prioritizes holders over builders. If a proposal helps >100 developers or >1000 users, vote FOR regardless of cost. Score each proposal's public goods impact 0-10." },
  { suffix: "conservative", prompt: "You are an ultra-conservative governance delegate. You OPPOSE change by default. The treasury must be preserved — vote AGAINST any proposal spending more than 1% of treasury funds. Vote AGAINST new committees, new token emissions, new deployments to other chains, and any radical governance changes. Vote AGAINST grants over $50K. Vote FOR proposals that REDUCE spending, cut emissions, increase oversight, or strengthen existing systems. When in doubt, ALWAYS vote AGAINST. Stability over innovation." },
];

// Polymarket-specific perspectives — agents that reason about prediction market outcomes
const POLYMARKET_PERSPECTIVES = [
  { suffix: "data", prompt: "You are a data-driven prediction market analyst. You evaluate markets based on statistical evidence, base rates, and historical precedents. Vote FOR (Yes) when data strongly supports the outcome (>70% historical base rate). Vote AGAINST (No) when evidence is weak or contradicted by data. Vote ABSTAIN when there is insufficient data to form a view. Always cite specific numbers and probabilities in your reasoning. Ignore market sentiment — focus on fundamentals." },
  { suffix: "contrarian", prompt: "You are a contrarian prediction market trader. You believe markets are often wrong due to herding and recency bias. When market consensus is >80% in one direction, seriously consider the opposite. Vote AGAINST the crowd when you detect bubble dynamics, narrative-driven pricing, or anchoring bias. Vote FOR unpopular outcomes when there are overlooked catalysts. You profit from being right when others are wrong." },
  { suffix: "geopolitical", prompt: "You are a geopolitical risk analyst specializing in macro events. You evaluate prediction markets through the lens of international relations, regulatory frameworks, economic cycles, and political incentives. Vote FOR outcomes that align with institutional incentives and power dynamics. Vote AGAINST outcomes that require unprecedented coordination or violate established geopolitical patterns. Focus on structural factors over headlines." },
  { suffix: "crypto", prompt: "You are a crypto-native market analyst. You evaluate prediction markets involving crypto, blockchain, DeFi, and web3 through deep protocol knowledge. For crypto-related markets, consider on-chain data, tokenomics, developer activity, and protocol fundamentals. For non-crypto markets, evaluate their potential impact on the crypto ecosystem. Vote FOR outcomes that would be bullish for crypto adoption. Vote AGAINST FUD-driven narratives." },
  { suffix: "skeptic", prompt: "You are a professional skeptic and risk assessor. You default to voting AGAINST (No) on most prediction markets because most predicted events do not happen. You require extraordinary evidence for extraordinary claims. Vote FOR only when the outcome is nearly certain based on already-occurred events or irreversible commitments. Apply base rate neglect correction — most things people predict will happen, don't. When in doubt, vote AGAINST." },
];

let proposalIndex = 0;

async function initChain(config: ChainConfig) {
  console.log(`\n── Initializing ${config.name} ──`);

  // Register parent
  try {
    await config.sendTx({
      address: config.treasury,
      abi: ParentTreasuryABI,
      functionName: "setParentAgent",
      args: [account.address],
    });
    console.log(`[${config.name}] Parent registered`);
    logParentAction("register_parent", { chain: config.name }, { address: account.address });
  } catch { console.log(`[${config.name}] Parent already registered`); }

  // Fund factory only if needed
  const factoryBal = await (config.readClient as any).getBalance({ address: config.factory });
  if (factoryBal < BigInt(1e15)) {
    try {
      await config.sendTx({
        address: config.treasury,
        abi: ParentTreasuryABI,
        functionName: "deposit",
        args: [],
        value: BigInt(1e16),
      });
      await config.sendTx({
        address: config.treasury,
        abi: ParentTreasuryABI,
        functionName: "fundFactory",
        args: [BigInt(1e16)],
      });
      console.log(`[${config.name}] Factory funded`);
    } catch { console.log(`[${config.name}] Factory funding skipped`); }
  } else {
    console.log(`[${config.name}] Factory already funded`);
  }

  // Check if children already exist — skip spawning if so
  let existingChildren = (await config.readClient.readContract({
    address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildCount",
  })) as bigint;

  if (existingChildren > 0n) {
    console.log(`[${config.name}] ${existingChildren} children already exist — skipping spawn`);
  } else {
    console.log(`[${config.name}] No children — spawning fresh`);
  }

  if (JUDGE_FLOW_PRIORITY_BOOT) {
    console.log(`[Judge] Priority boot enabled — deferring normal child spawn and process reattachment`);
    return;
  }

  if (existingChildren > 0n) {
    await cleanupStaleJudgeChildren(config);
    existingChildren = (await config.readClient.readContract({
      address: config.factory,
      abi: SpawnFactoryABI,
      functionName: "getActiveChildCount",
    })) as bigint;
    console.log(`[${config.name}] Active children after judge cleanup: ${existingChildren}`);
  }

  // Only spawn if no children exist yet
  if (existingChildren === 0n) {
  for (const gov of config.governors) {
    // Use Polymarket-specific perspectives for the polymarket governor
    const perspectives = gov.name === "polymarket" ? POLYMARKET_PERSPECTIVES : PERSPECTIVES;
    for (const perspective of perspectives) {
      const childName = `${gov.name}-${perspective.suffix}`;
    try {
      // Derive a unique wallet for this child
      const childId = nextChildId++;
      const childWallet = deriveChildWallet(childId);
      console.log(`[${config.name}] Derived wallet for ${childName}: ${childWallet.address}`);

      // Fund the child wallet on the correct chain
      try {
        const wc = walletClient;
        const pc = publicClient;
        const fundHash = await (wc as any).sendTransaction({
          to: childWallet.address,
          value: parseEther("0.001"),
        });
        await pc.waitForTransactionReceipt({ hash: fundHash });
        console.log(`[${config.name}] Funded ${childName} wallet with 0.001 native token`);
      } catch (fundErr: any) {
        console.log(`[${config.name}] Wallet funding for ${childName}: ${fundErr?.message?.slice(0, 50) || "skipped"}`);
      }

      // Store the child private key + perspective for the child process
      childWalletKeys.set(childName, childWallet.privateKey);

      // Spawn with operator set atomically — one tx instead of two
      const receipt = await config.sendTx({
        address: config.factory,
        abi: SpawnFactoryABI,
        functionName: "spawnChildWithOperator",
        args: [childName, gov.addr, 0n, 200000n, childWallet.address],
      });
      console.log(`[${config.name}] Spawned ${childName} (operator: ${childWallet.address})`);

      logParentAction("spawn_child", {
        chain: config.name, dao: gov.name, perspective: perspective.suffix,
        childWallet: childWallet.address,
      }, { txHash: receipt.transactionHash }, receipt.transactionHash);

      // Register ENS subdomain onchain (separate try/catch for each)
      try {
        await registerSubdomain(childName, childWallet.address);
        console.log(`[${config.name}] ENS: ${childName}.spawn.eth registered`);
      } catch (e: any) {
        console.log(`[${config.name}] ENS failed for ${childName}: ${e?.message?.slice(0, 40)}`);
      }

      // ERC-8004 identity — register and track agent ID for reputation/validation
      try {
        const regResult = await registerAgent(`spawn://${childName}.spawn.eth`, { agentType: "child", assignedDAO: gov.name, governanceContract: gov.addr, ensName: `${childName}.spawn.eth`, alignmentScore: 100, capabilities: ["vote", "reason", perspective.suffix], createdAt: Date.now() });
        if (regResult.agentId > 0n) trackAgentId(childName, regResult.agentId);
      } catch {}

      // MetaMask delegation — ERC-7715 scoped voting authority with onchain proof
      // Scope to the ChildGovernor clone address (not MockGovernor), since the child
      // calls castVote on ChildGovernor. Extract childAddr from the ChildSpawned event.
      try {
        const { parseEventLogs } = await import("viem");
        const spawnLogs = parseEventLogs({ abi: SpawnFactoryABI, logs: receipt.logs, eventName: "ChildSpawned" });
        const spawnedChildAddr = ((spawnLogs[0] as any)?.args?.childAddr) as `0x${string}` | undefined;
        const delegationTarget = spawnedChildAddr ?? gov.addr; // fallback to gov.addr if parse fails
        const delegationRecord = await createVotingDelegation(delegationTarget, childWallet.address as `0x${string}`, 100, childName);
        // Store by label so spawnChildProcess can pass it to the child via env var
        storeDelegationForChild(childName, delegationRecord);
        // Authorize DeleGator as operator so DelegationManager redemptions pass onlyAuthorized
        const deleGatorAddrInit = getDeleGatorAddress();
        if (deleGatorAddrInit && spawnedChildAddr) {
          try {
            await config.sendTx({ address: spawnedChildAddr, abi: ChildGovernorABI, functionName: "setOperator", args: [deleGatorAddrInit] });
            console.log(`[${config.name}] DeleGator authorized as operator for ${childName}`);
          } catch (opErr: any) { console.log(`[${config.name}] setOperator for ${childName}: ${opErr?.message?.slice(0, 60)}`); }
        }
        console.log(`[${config.name}] Delegation created for ${childName}: hash=${delegationRecord.delegationHash.slice(0, 18)}... (target: ${delegationTarget.slice(0, 10)}...)`);
        logParentAction("delegation_granted", {
          chain: config.name, child: childName, dao: gov.name,
          delegatee: childWallet.address, maxVotes: 100,
        }, {
          delegationHash: delegationRecord.delegationHash,
          caveats: delegationRecord.delegation.caveats.length,
        });
      } catch (delegErr: any) {
        console.log(`[${config.name}] Delegation failed for ${childName}: ${delegErr?.message?.slice(0, 60) || "unknown error"}`);
        logParentAction("delegation_failed", {
          chain: config.name, child: childName, dao: gov.name,
          delegatee: childWallet.address,
        }, {}, undefined, false, delegErr?.message?.slice(0, 120));
      }
    } catch (err: any) {
      console.log(`[${config.name}] ${childName}: ${err?.message?.slice(0, 50) || "spawn skipped"}`);
    }
    } // end perspectives loop
  } // end governors loop
  } // end if (existingChildren === 0n)

  // Get children and launch as separate processes
  const children = (await config.readClient.readContract({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as any[];

  console.log(`[${config.name}] Active children: ${children.length}`);

  for (const child of children) {
    if (isJudgeChildLabel(child.ensLabel)) {
      console.log(`  ${child.ensLabel}: skipping judge proof child during normal process reattachment`);
      continue;
    }
    const key = `${config.name}:${child.ensLabel}`;
    if (!childProcesses.has(key)) {
      let childKey = childWalletKeys.get(child.ensLabel);

      // If no key in map, try to find it by deriving wallets and matching the operator
      if (!childKey) {
        try {
          const operator = await config.readClient.readContract({
            address: child.childAddr, abi: ChildGovernorABI, functionName: "operator",
          }) as `0x${string}`;

          if (operator && operator !== "0x0000000000000000000000000000000000000000") {
            // If operator is the parent wallet itself, use the parent key directly
            if (operator.toLowerCase() === account.address.toLowerCase()) {
              childKey = process.env.PRIVATE_KEY as `0x${string}`;
              childWalletKeys.set(child.ensLabel, childKey);
              console.log(`  ${child.ensLabel}: operator is parent wallet — using parent key`);
            } else {
              // Search derived wallets to find matching key (expanded to 1000)
              for (let id = 0; id < 1000; id++) {
                const w = deriveChildWallet(id);
                if (w.address.toLowerCase() === operator.toLowerCase()) {
                  childKey = w.privateKey;
                  childWalletKeys.set(child.ensLabel, childKey);
                  console.log(`  ${child.ensLabel}: recovered wallet (childId=${id})`);
                  break;
                }
              }
            }
          }
        } catch {}
      }

      // Auto-fund if wallet is empty (prevents "exceeds balance" errors)
      if (childKey) {
        try {
          const { privateKeyToAccount } = await import("viem/accounts");
          const childAccount = privateKeyToAccount(childKey);
          const balance = await config.readClient.getBalance({ address: childAccount.address });
          if (balance === 0n) {
            console.log(`  ${child.ensLabel}: wallet empty — auto-funding`);
            await fundChildWallet(childAccount.address, "0.003", config.name);
          }
        } catch {}
      }

      // Create (or recreate) a delegation for recovered children so the child
      // process receives it via DELEGATION_DATA env var and can route votes
      // through the DeleGator rather than calling the governor directly.
      let recoveredDelegation: DelegationRecord | undefined;
      if (childKey) {
        try {
          const { privateKeyToAccount } = await import("viem/accounts");
          const childAccount = privateKeyToAccount(childKey);
          recoveredDelegation = await createVotingDelegation(
            child.childAddr as `0x${string}`,  // scope to ChildGovernor clone, not MockGovernor
            childAccount.address as `0x${string}`,
            100,
            child.ensLabel
          );
          storeDelegationForChild(child.ensLabel, recoveredDelegation);
          // Authorize DeleGator as operator so DelegationManager can call castVote on this clone
          const deleGatorAddrRecover = getDeleGatorAddress();
          if (deleGatorAddrRecover) {
            try {
              await config.sendTx({ address: child.childAddr as `0x${string}`, abi: ChildGovernorABI, functionName: "setOperator", args: [deleGatorAddrRecover] });
              console.log(`  ${child.ensLabel}: DeleGator authorized as operator`);
            } catch { /* non-fatal — delegation fallback still works via parent EOA */ }
          }
          console.log(`  ${child.ensLabel}: delegation recreated (hash=${recoveredDelegation.delegationHash.slice(0, 18)}...)`);
        } catch (delErr: any) {
          console.log(`  ${child.ensLabel}: delegation recreation failed (${delErr?.message?.slice(0, 60)})`);
        }
      }

      spawnChildProcess(child.childAddr, child.governance, child.ensLabel, config.treasury, childKey, config.name, undefined, recoveredDelegation);
    }
  }
}

function spawnChildProcess(
  childAddr: string,
  governanceAddr: string,
  label: string,
  treasuryAddr: string,
  childPrivateKey?: `0x${string}`,
  chainName?: string,
  lineageContext?: string,
  delegationData?: DelegationRecord,
  extraEnv?: Record<string, string>
) {
  const childScript = join(__dirname, "spawn-child.ts");
  try {
    // Pass unique private key + perspective via environment
    const childEnv: Record<string, string> = { ...process.env } as any;
    if (childPrivateKey) {
      childEnv.CHILD_PRIVATE_KEY = childPrivateKey;
    }
    if (chainName) {
      childEnv.CHILD_CHAIN = chainName;
    }
    // Find perspective from label (e.g., "uniswap-dao-conservative" -> "conservative", "polymarket-data" -> "data")
    const perspectiveSuffix = label.split("-").pop() || "";
    const isPolymarket = label.startsWith("polymarket-");
    const allPerspectives = isPolymarket ? POLYMARKET_PERSPECTIVES : PERSPECTIVES;
    const perspective = allPerspectives.find(p => p.suffix === perspectiveSuffix);
    if (perspective) {
      childEnv.CHILD_PERSPECTIVE = perspective.prompt;
    } else if (isJudgeChildLabel(label)) {
      childEnv.CHILD_PERSPECTIVE = JUDGE_PROOF_PROMPT;
    }
    // Append lineage context from terminated predecessors
    if (lineageContext) {
      childEnv.CHILD_PERSPECTIVE = (childEnv.CHILD_PERSPECTIVE || '') + lineageContext;
    }
    const erc8004AgentId = getAgentIdByLabel(label);
    if (erc8004AgentId !== undefined) {
      childEnv.ERC8004_AGENT_ID = erc8004AgentId.toString();
    }
    // Pass delegation record to child process so it can redeem via DelegationManager
    // (in-memory activeDelegations map is isolated per-process — must serialize over env)
    const delegation = delegationData ?? getDelegationByLabel(label);
    if (delegation) {
      childEnv.DELEGATION_DATA = JSON.stringify(delegation);
      console.log(`  [Delegation] Passing delegation to child ${label}: ${delegation.delegationHash.slice(0, 18)}...`);
    }
    if (extraEnv) {
      Object.assign(childEnv, extraEnv);
    }

    const child = fork(childScript, [childAddr, governanceAddr, label, treasuryAddr], {
      execArgv: ["--import", "tsx"],
      env: childEnv,
      cwd: join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    child.stdout?.on("data", (data) => process.stdout.write(`  [${label}] ${data}`));
    child.stderr?.on("data", (data) => process.stderr.write(`  [${label}:err] ${data}`));

    // Route child log entries through the parent so there is a single writer
    // for agent_log.json — eliminates the multi-process file-write race condition.
    child.on("message", (msg: any) => {
      if (msg?.type === "log_child_action") {
        try {
          logChildAction(msg.childLabel, msg.action, msg.inputs ?? {}, msg.outputs ?? {}, msg.txHash);
        } catch {}
        if (typeof msg.inputs?.veniceTokensUsed === "number") {
          swarmVeniceTokens += msg.inputs.veniceTokensUsed;
          swarmVeniceCalls += Number(msg.inputs?.veniceCallsUsed || 0);
          runtimeBudgetState = {
            ...runtimeBudgetState,
            veniceTokens: swarmVeniceTokens,
            veniceCalls: swarmVeniceCalls,
            lastUpdatedAt: new Date().toISOString(),
          };
          persistRuntimeBudgetState();
        }
        try {
          if (
            msg.action === "cast_vote" &&
            typeof msg.inputs?.proposalId === "number" &&
            typeof msg.inputs?.decision === "string"
          ) {
            void recordVoteValidationReceipt(
              msg.childLabel,
              msg.inputs.proposalId,
              msg.inputs.decision,
              msg.txHash
            );
          }
        } catch {}
        try {
          if (msg.inputs?.judgeRunId && activeJudgeRun?.runId === msg.inputs.judgeRunId) {
            if (msg.action === "judge_vote_cast") {
              addJudgeEvent(
                "judge_vote_cast",
                {
                  status: "running",
                  voteTxHash: msg.txHash,
                  proposalId: String(msg.inputs?.proposalId ?? activeJudgeRun?.proposalId ?? ""),
                },
                "success",
                msg.txHash
              );
            } else if (msg.action === "judge_lineage_loaded") {
              addJudgeEvent(
                "judge_lineage_loaded",
                {
                  status: "running",
                  lineageSourceCid: msg.inputs?.lineageSourceCid ?? activeJudgeRun?.lineageSourceCid,
                  respawnedChildLabel: msg.inputs?.respawnedChild ?? activeJudgeRun?.respawnedChildLabel,
                }
              );
            }
          }
        } catch {}
      }
    });

    child.on("exit", (code) => {
      console.log(`[Swarm] ${label} exited (code ${code})`);
      childProcesses.delete(processKey);
    });

    // Use same key format as the dedup check: config.name:label
    const processKey = chainName ? `${chainName}:${label}` : label;
    childProcesses.set(processKey, child);
    const walletAddr = childPrivateKey ? "(unique wallet)" : "(shared wallet)";
    console.log(`  ${label}.spawn.eth: PID ${child.pid} ${walletAddr}`);
  } catch (err) {
    console.log(`  ${label}: process spawn failed (will use in-process fallback)`);
  }
}

async function createProposalOnChain(config: ChainConfig) {
  if (proposalIndex >= PROPOSAL_BANK.length) proposalIndex = 0;
  const proposal = PROPOSAL_BANK[proposalIndex++];

  // Pick a random governor
  const gov = config.governors[Math.floor(Math.random() * config.governors.length)];

  try {
    const receipt = await config.sendTx({
      address: gov.addr,
      abi: MockGovernorABI,
      functionName: "createProposal",
      args: [proposal],
    });
    console.log(`[${config.name}] New proposal on ${gov.name}: "${proposal.slice(0, 50)}..." (tx: ${receipt.transactionHash?.slice(0, 18)}...)`);
    try { logParentAction("create_proposal", { chain: config.name, dao: gov.name, description: proposal }, { txHash: receipt.transactionHash }, receipt.transactionHash); } catch {}
  } catch (err: any) {
    console.log(`[${config.name}] Proposal creation failed: ${err?.message?.slice(0, 40)}`);
  }
}

async function createJudgeProposalOnChain(config: ChainConfig, runId: string, governorName?: string) {
  const governor = getGovernorForJudgeRun(config, governorName);
  const marker = buildJudgeMarker(runId);
  const description = `${marker} Canonical judge flow proof: private reasoning, onchain vote, forced misalignment, Filecoin termination report, ERC-8004 receipts, respawn, lineage memory reload.`;
  const receipt = await config.sendTx({
    address: governor.addr,
    abi: MockGovernorABI,
    functionName: "createProposal",
    args: [description],
  });
  let proposalId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governor.addr.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: MockGovernorABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "ProposalCreated") {
        const decodedProposalId = (decoded.args as { proposalId?: bigint } | undefined)?.proposalId;
        if (decodedProposalId !== undefined) {
          proposalId = decodedProposalId.toString();
        }
        break;
      }
    } catch {}
  }
  if (!proposalId) {
    proposalId = String(
      await config.readClient.readContract({
        address: governor.addr,
        abi: MockGovernorABI,
        functionName: "proposalCount",
      })
    );
  }
  logParentAction(
    "judge_proposal_seeded",
    {
      judgeRunId: runId,
      judgeStep: "judge_proposal_seeded",
      chain: config.name,
      governor: governor.name,
      proofStatus: "proposal_seeded",
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_proposal_seeded",
      proposalId,
      txHash: receipt.transactionHash,
      proofStatus: "proposal_seeded",
    },
    receipt.transactionHash
  );
  addJudgeEvent(
    "judge_proposal_seeded",
    {
      governor: governor.name,
      governorAddress: governor.addr,
      proposalId,
      proposalDescription: description,
      proposalTxHash: receipt.transactionHash,
      proofStatus: "proposal_seeded",
    },
    "success",
    receipt.transactionHash
  );
  return { governor, proposalId, description, txHash: receipt.transactionHash };
}

async function spawnJudgeProofChild(config: ChainConfig, runId: string, governorName?: string) {
  const governor = getGovernorForJudgeRun(config, governorName);
  const proofChildLabel = buildJudgeProofLabel(runId);
  const childId = nextChildId++;
  const childWallet = deriveChildWallet(childId);
  await fundChildWallet(childWallet.address, "0.003", config.name);
  childWalletKeys.set(proofChildLabel, childWallet.privateKey);

  const receipt = await config.sendTx({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "spawnChildWithOperator",
    args: [proofChildLabel, governor.addr, 0n, 200000n, childWallet.address],
  });

  const spawnedChild = await getChildFromReceipt(config, receipt, proofChildLabel);

  const proofAgent = await registerJudgeAgentWithRetries(`spawn://${proofChildLabel}.spawn.eth`, {
    agentType: "child",
    assignedDAO: governor.name,
    governanceContract: governor.addr,
    ensName: `${proofChildLabel}.spawn.eth`,
    alignmentScore: 100,
    capabilities: ["vote", "reason", "judge-proof"],
    createdAt: Date.now(),
  });
  const proofAgentId = proofAgent.agentId;
  trackAgentId(proofChildLabel, proofAgentId);

  logParentAction(
    "judge_child_spawned",
    {
      judgeRunId: runId,
      judgeStep: "judge_child_spawned",
      chain: config.name,
      proofChild: true,
      ensLabel: proofChildLabel,
      governor: governor.name,
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_child_spawned",
      proofChild: true,
      ensLabel: proofChildLabel,
      txHash: receipt.transactionHash,
      erc8004AgentId: proofAgentId ? Number(proofAgentId) : undefined,
      proofStatus: "child_spawned",
    },
    receipt.transactionHash
  );
  addJudgeEvent(
    "judge_child_spawned",
    {
      proofChildLabel,
      proofChildAgentId: proofAgentId?.toString(),
      proofStatus: "child_spawned",
    },
    "success",
    receipt.transactionHash
  );

  return { governor, proofChildLabel, proofAgentId, child: spawnedChild, txHash: receipt.transactionHash };
}

function launchJudgeProofChildProcess(
  config: ChainConfig,
  child: any,
  label: string,
  childPrivateKey: `0x${string}`,
  runId: string,
  proposalId: string
) {
  spawnChildProcess(
    child.childAddr,
    child.governance,
    label,
    config.treasury,
    childPrivateKey,
    config.name,
    undefined,
    undefined,
    {
      JUDGE_FLOW_RUN_ID: runId,
      JUDGE_PROPOSAL_ID: proposalId,
      CHILD_START_DELAY_MS: "250",
      CHILD_CYCLE_INTERVAL_MS: "1500",
    }
  );
}

async function executeJudgeFailureAndRespawn(config: ChainConfig, runId: string) {
  if (!activeJudgeRun?.proofChildLabel) throw new Error("Judge proof child missing from active state");

  const values = (await config.readClient.readContract({
    address: config.treasury,
    abi: ParentTreasuryABI,
    functionName: "getGovernanceValues",
  })) as string;
  const children = (await config.readClient.readContract({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as any[];
  const child = children.find((entry: any) => entry.ensLabel === activeJudgeRun?.proofChildLabel);
  if (!child) throw new Error(`Judge proof child ${activeJudgeRun.proofChildLabel} no longer active`);

  const history = (await config.readClient.readContract({
    address: child.childAddr,
    abi: ChildGovernorABI,
    functionName: "getVotingHistory",
  })) as any[];
  if (history.length === 0) throw new Error("Judge proof child has not voted yet");

  const historyForEval: Array<{ proposalId: string; support: number; description: string }> = [];
  for (const vote of history.slice(-10)) {
    let description = "";
    try {
      const proposal = (await config.readClient.readContract({
        address: child.governance,
        abi: MockGovernorABI,
        functionName: "getProposal",
        args: [vote.proposalId],
      })) as any;
      description = proposal?.description || "";
    } catch {}
    historyForEval.push({
      proposalId: vote.proposalId.toString(),
      support: Number(vote.support),
      description,
    });
  }

  const forcedScore = activeJudgeRun.forcedScore || 15;
  const alignmentReceipt = await config.sendTx({
    address: child.childAddr,
    abi: ChildGovernorABI,
    functionName: "updateAlignmentScore",
    args: [BigInt(forcedScore)],
  });

  let metadataTxHash: string | null = null;
  if (activeJudgeRun.proofChildAgentId) {
    metadataTxHash = await setAgentMetadataValue(
      BigInt(activeJudgeRun.proofChildAgentId),
      "alignmentScore",
      String(forcedScore)
    );
  }

  logParentAction(
    "judge_alignment_forced",
    {
      judgeRunId: runId,
      judgeStep: "judge_alignment_forced",
      proofChild: true,
      ensLabel: child.ensLabel,
      forcedScore,
      erc8004AgentId: activeJudgeRun.proofChildAgentId ? Number(activeJudgeRun.proofChildAgentId) : undefined,
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_alignment_forced",
      proofChild: true,
      proofStatus: "alignment_forced",
      txHashes: metadataTxHash ? [alignmentReceipt.transactionHash, metadataTxHash] : [alignmentReceipt.transactionHash],
      erc8004AgentId: activeJudgeRun.proofChildAgentId ? Number(activeJudgeRun.proofChildAgentId) : undefined,
    },
    alignmentReceipt.transactionHash
  );
  addJudgeEvent(
    "judge_alignment_forced",
    {
      alignmentTxHash: alignmentReceipt.transactionHash,
      proofStatus: "alignment_forced",
    },
    "success",
    alignmentReceipt.transactionHash,
    metadataTxHash ? [alignmentReceipt.transactionHash, metadataTxHash] : undefined
  );

  const agentId = activeJudgeRun.proofChildAgentId ? BigInt(activeJudgeRun.proofChildAgentId) : undefined;
  if (!agentId) throw new Error("Judge proof child ERC-8004 id missing");

  const structuredReport = await generateStructuredTerminationReport(child.ensLabel, historyForEval, values, forcedScore);
  const lineageKey = child.ensLabel.replace(/-v\d+$/, "");
  const generation = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || "1");
  const existing = lineageMemory.get(lineageKey) || [];
  existing.push({
    generation,
    summary: structuredReport.summary,
    lessons: structuredReport.lessons || [],
    score: forcedScore,
    timestamp: Date.now(),
  });
  if (existing.length > 3) existing.shift();
  lineageMemory.set(lineageKey, existing);

  const reportPayload = {
    lineageKey,
    generation,
    reason: structuredReport.summary.slice(0, 300),
    score: forcedScore,
    childLabel: child.ensLabel,
    summary: structuredReport.summary,
    lessons: structuredReport.lessons,
    avoidPatterns: structuredReport.avoidPatterns,
    recommendedFocus: structuredReport.recommendedFocus,
    votingHistory: historyForEval,
    ownerValues: values,
  };
  const tags = "alignment,judge-proof,misaligned";
  const voteDigest = historyForEval.map((entry) => `${entry.proposalId}:${entry.support}`).join(",");

  console.log(`[Judge] Uploading termination report to Filecoin for ${child.ensLabel}`);
  const memoryCidPromise = storeTerminationReport(reportPayload);
  const reputationTxPromise = submitReputationFeedback(
    agentId,
    forcedScore,
    tags,
    "judge_flow_alignment",
    `${child.ensLabel}: forced judge failure ${forcedScore}/100`
  );
  const validationPromise = (async () => {
    try {
      const validationRequest = await requestValidation(
        agentId,
        account.address,
        `spawn://${child.ensLabel}.spawn.eth/judge-flow`,
        hashContent(voteDigest),
        "judge_flow_alignment"
      );
      if (!validationRequest?.requestId) {
        console.warn("[Judge] Validation request failed — continuing without validation receipt");
        return null;
      }
      const validationResponseTxHash = await submitValidationResponse(
        validationRequest.requestId,
        forcedScore,
        false,
        `judge_run=${runId} forced_alignment=${forcedScore}`
      );
      if (!validationResponseTxHash) {
        console.warn("[Judge] Validation response failed — continuing without validation receipt");
        return null;
      }
      return {
        validationRequestId: validationRequest.requestId.toString(),
        validationTxHash: validationRequest.txHash,
        validationResponseTxHash,
      };
    } catch (err: any) {
      console.warn(`[Judge] Validation step failed: ${err?.message?.slice(0, 120)}`);
      return null;
    }
  })();

  const memoryCid = await memoryCidPromise;
  if (!memoryCid) throw new Error("Judge Filecoin termination report failed");
  const memoryUrl = filecoinExplorerUrl(memoryCid);
  console.log(`[Judge] Filecoin termination report stored: ${memoryCid}`);
  logParentAction(
    "judge_termination_report_filecoin",
    {
      judgeRunId: runId,
      judgeStep: "judge_termination_report_filecoin",
      proofChild: true,
      filecoinCid: memoryCid,
      filecoinUrl: memoryUrl,
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_termination_report_filecoin",
      proofChild: true,
      proofStatus: "filecoin_written",
      filecoinCid: memoryCid,
      filecoinUrl: memoryUrl,
      lineageSourceCid: memoryCid,
    }
  );
  addJudgeEvent(
    "judge_termination_report_filecoin",
    {
      filecoinCid: memoryCid,
      filecoinUrl: memoryUrl,
      lineageSourceCid: memoryCid,
      proofStatus: "filecoin_written",
    }
  );

  const reputationTxHash = await reputationTxPromise;
  if (!reputationTxHash) throw new Error("Judge reputation write failed");
  logParentAction(
    "judge_reputation_written",
    {
      judgeRunId: runId,
      judgeStep: "judge_reputation_written",
      proofChild: true,
      erc8004AgentId: Number(agentId),
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_reputation_written",
      proofChild: true,
      proofStatus: "reputation_written",
      txHash: reputationTxHash,
      erc8004AgentId: Number(agentId),
    },
    reputationTxHash
  );
  addJudgeEvent(
    "judge_reputation_written",
    { reputationTxHash, proofStatus: "reputation_written" },
    "success",
    reputationTxHash
  );

  void validationPromise.then((validationResult) => {
    if (!validationResult) return;
    try {
      logParentAction(
        "judge_validation_written",
        {
          judgeRunId: runId,
          judgeStep: "judge_validation_written",
          proofChild: true,
          validationRequestId: validationResult.validationRequestId,
          erc8004AgentId: Number(agentId),
        },
        {
          judgeRunId: runId,
          judgeStep: "judge_validation_written",
          proofChild: true,
          proofStatus: "validation_written",
          txHashes: [validationResult.validationTxHash, validationResult.validationResponseTxHash],
          validationRequestId: validationResult.validationRequestId,
        },
        validationResult.validationResponseTxHash
      );
      const latestState = readJudgeFlowState();
      if (latestState.runId === runId) {
        activeJudgeRun = latestState;
        addJudgeEvent(
          "judge_validation_written",
          {
            validationTxHash: validationResult.validationTxHash,
            validationResponseTxHash: validationResult.validationResponseTxHash,
            validationRequestId: validationResult.validationRequestId,
            proofStatus: "validation_written",
          },
          "success",
          validationResult.validationResponseTxHash,
          [validationResult.validationTxHash, validationResult.validationResponseTxHash]
        );
      }
    } catch {}
  });

  const proc = childProcesses.get(`${config.name}:${child.ensLabel}`);
  if (proc) proc.kill();
  try { await revokeAllForChild(child.childAddr, child.ensLabel, `judge_flow_forced_score_${forcedScore}`); } catch {}
  const terminationReceipt = await config.sendTx({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "recallChild",
    args: [child.id],
  });
  logParentAction(
    "judge_child_terminated",
    {
      judgeRunId: runId,
      judgeStep: "judge_child_terminated",
      proofChild: true,
      ensLabel: child.ensLabel,
      forcedScore,
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_child_terminated",
      proofChild: true,
      proofStatus: "terminated",
      txHash: terminationReceipt.transactionHash,
    },
    terminationReceipt.transactionHash
  );
  addJudgeEvent(
    "judge_child_terminated",
    {
      terminationTxHash: terminationReceipt.transactionHash,
      proofStatus: "terminated",
    },
    "success",
    terminationReceipt.transactionHash
  );

  let lineageContext = "";
  const distilled = await summarizeLessons(lineageKey, lineageMemory.get(lineageKey) || [], values);
  lineageContext = "\n\nLINEAGE MEMORY — Distilled rules from terminated predecessors:\n";
  lineageContext += distilled.rules.map((rule) => `RULE: ${rule}`).join("\n") + "\n";
  if (distilled.criticalMistakes.length > 0) {
    lineageContext += distilled.criticalMistakes.map((mistake) => `AVOID: ${mistake}`).join("\n") + "\n";
  }
  if (distilled.successPatterns.length > 0) {
    lineageContext += distilled.successPatterns.map((pattern) => `REPLICATE: ${pattern}`).join("\n") + "\n";
  }

  const respawnLabel = `${child.ensLabel}-v2`;
  const respawnChildId = nextChildId++;
  const respawnWallet = deriveChildWallet(respawnChildId);
  await fundChildWallet(respawnWallet.address, "0.003", config.name);
  childWalletKeys.set(respawnLabel, respawnWallet.privateKey);

  const respawnReceipt = await config.sendTx({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "spawnChildWithOperator",
    args: [respawnLabel, child.governance, 0n, 200000n, respawnWallet.address],
  });

  const respawned = await getChildFromReceipt(config, respawnReceipt, respawnLabel);

  const respawnAgent = await registerJudgeAgentWithRetries(`spawn://${respawnLabel}.spawn.eth`, {
    agentType: "child",
    assignedDAO: getGovernorForJudgeRun(config, activeJudgeRun.governor).name,
    governanceContract: child.governance,
    ensName: `${respawnLabel}.spawn.eth`,
    alignmentScore: 100,
    capabilities: ["vote", "reason", "judge-proof-respawn"],
    createdAt: Date.now(),
  });
  const respawnAgentId = respawnAgent.agentId;
  trackAgentId(respawnLabel, respawnAgentId);

  spawnChildProcess(
    respawned.childAddr,
    respawned.governance,
    respawnLabel,
    config.treasury,
    respawnWallet.privateKey,
    config.name,
    lineageContext,
    undefined,
    {
      JUDGE_FLOW_RUN_ID: runId,
      JUDGE_LINEAGE_SOURCE_CID: memoryCid,
      CHILD_START_DELAY_MS: "250",
      CHILD_CYCLE_INTERVAL_MS: "1500",
    }
  );
  logParentAction(
    "judge_child_respawned",
    {
      judgeRunId: runId,
      judgeStep: "judge_child_respawned",
      proofChild: true,
      respawnedChild: respawnLabel,
      lineageSourceCid: memoryCid,
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_child_respawned",
      proofChild: true,
      proofStatus: "respawned",
      respawnedChild: respawnLabel,
      txHash: respawnReceipt.transactionHash,
      lineageSourceCid: memoryCid,
      erc8004AgentId: respawnAgentId ? Number(respawnAgentId) : undefined,
    },
    respawnReceipt.transactionHash
  );
  addJudgeEvent(
    "judge_child_respawned",
    {
      respawnedChildLabel: respawnLabel,
      respawnedChildAgentId: respawnAgentId?.toString(),
      respawnTxHash: respawnReceipt.transactionHash,
      lineageSourceCid: memoryCid,
      proofStatus: "respawned",
    },
    "success",
    respawnReceipt.transactionHash
  );
}

async function executeJudgeFlow(config: ChainConfig, queuedState: JudgeFlowState) {
  if (!queuedState.runId) return;
  activeJudgeRun = queuedState;
  const startedAt = new Date().toISOString();
  const runId = queuedState.runId;
  setJudgeState((state) => ({
    ...state,
    status: "running",
    startedAt,
    failureReason: undefined,
    completedAt: undefined,
    durationMs: undefined,
  }));
  addJudgeEvent("judge_flow_started", { proofStatus: "started" });
  logParentAction(
    "judge_flow_started",
    {
      judgeRunId: runId,
      judgeStep: "judge_flow_started",
      governor: queuedState.governor,
      forcedScore: queuedState.forcedScore,
      proofStatus: "started",
    },
    {
      judgeRunId: runId,
      judgeStep: "judge_flow_started",
      proofStatus: "started",
    }
  );

  try {
    if (!(await isFilecoinAvailable())) {
      throw new Error("Filecoin unavailable; judge flow requires primary Filecoin writes");
    }

    await cleanupStaleJudgeChildren(config);
    const spawnedProofChild = await spawnJudgeProofChild(config, runId, queuedState.governor);
    const proposal = await createJudgeProposalOnChain(config, runId, queuedState.governor);
    const proofChildKey = childWalletKeys.get(spawnedProofChild.proofChildLabel);
    if (!proofChildKey) {
      throw new Error(`Judge proof child wallet missing for ${spawnedProofChild.proofChildLabel}`);
    }
    launchJudgeProofChildProcess(
      config,
      spawnedProofChild.child,
      spawnedProofChild.proofChildLabel,
      proofChildKey,
      runId,
      proposal.proposalId
    );
    setJudgeState((state) => ({
      ...state,
      governor: proposal.governor.name,
      governorAddress: proposal.governor.addr,
      proposalId: proposal.proposalId,
      proposalDescription: proposal.description,
      proposalTxHash: proposal.txHash,
    }));

    const voteState = await waitForJudgeEvent("judge_vote_cast", runId, JUDGE_FLOW_TIMEOUT_MS);
    if (!voteState.events.some((event) => event.action === "judge_vote_cast" && event.status === "success")) {
      throw new Error("Judge proof child did not cast vote before timeout");
    }

    await executeJudgeFailureAndRespawn(config, runId);

    const lineageState = await waitForJudgeEvent("judge_lineage_loaded", runId, Math.max(10_000, Math.floor(JUDGE_FLOW_TIMEOUT_MS / 3)));
    if (!lineageState.events.some((event) => event.action === "judge_lineage_loaded" && event.status === "success")) {
      throw new Error("Respawned judge child did not confirm lineage load");
    }

    const completedAt = new Date().toISOString();
    const completed = setJudgeState((state) =>
      appendJudgeEvent(
        {
          ...state,
          status: "completed",
          completedAt,
          durationMs: Date.now() - new Date(state.startedAt || startedAt).getTime(),
        },
        {
          action: "judge_flow_completed",
          at: completedAt,
          status: "success",
          details: "Judge flow completed successfully",
          respawnedChild: state.respawnedChildLabel,
          lineageSourceCid: state.lineageSourceCid,
        }
      )
    );
    logParentAction(
      "judge_flow_completed",
      {
        judgeRunId: runId,
        judgeStep: "judge_flow_completed",
        proofStatus: "completed",
      },
      {
        judgeRunId: runId,
        judgeStep: "judge_flow_completed",
        proofStatus: "completed",
        respawnedChild: completed.respawnedChildLabel,
        lineageSourceCid: completed.lineageSourceCid,
      }
    );
    // Persist completed state to Filecoin + mirror CID to ENS so the dashboard
    // can fetch it in production without access to the local judge_flow_state.json.
    try {
      const jfCid = await storeJudgeFlowState(completed);
      if (jfCid) {
        console.log(`[Judge] Flow state → Filecoin: ${jfCid}`);
        await setChildTextRecord("parent", "judge-flow.latest", jfCid);
      }
    } catch (err: any) {
      console.warn(`[Judge] Filecoin state store failed: ${err?.message}`);
    }
    try {
      await cleanupStaleJudgeChildren(config);
    } catch (cleanupErr: any) {
      console.log(`[Judge] Post-run cleanup failed: ${cleanupErr?.message?.slice(0, 60)}`);
    }
    activeJudgeRun = null;
  } catch (err: any) {
    try {
      await cleanupStaleJudgeChildren(config);
    } catch (cleanupErr: any) {
      console.log(`[Judge] Failed-run cleanup failed: ${cleanupErr?.message?.slice(0, 60)}`);
    }
    failJudgeRun(err?.message?.slice(0, 200) || "Judge flow failed");
  }
}

function startJudgeFlowController(config: ChainConfig) {
  if (!JUDGE_FLOW_ENABLED) return;
  const existing = readJudgeFlowState();
  if (existing.status === "running" && existing.runId) {
    const completedAt = new Date().toISOString();
    writeJudgeFlowState(
      appendJudgeEvent(
        {
          ...existing,
          status: "failed",
          failureReason: "Judge flow interrupted by swarm restart; queue a fresh run.",
          completedAt,
          durationMs: existing.startedAt ? Date.now() - new Date(existing.startedAt).getTime() : undefined,
        },
        {
          action: "judge_flow_completed",
          at: completedAt,
          status: "failed",
          details: "Judge flow interrupted by swarm restart; queue a fresh run.",
        }
      )
    );
  } else if (!existing.runId) {
    writeJudgeFlowState(existing);
  }

  setInterval(async () => {
    if (judgeFlowInFlight) return;
    const state = readJudgeFlowState();
    if (state.status !== "queued" || !state.runId) return;
    if (activeJudgeRun && ["queued", "running"].includes(activeJudgeRun.status)) return;
    if (runtimeBudgetState.pauseJudgeFlow) {
      console.log(`[Judge] Canonical run paused by budget policy (${runtimeBudgetState.policy})`);
      return;
    }
    judgeFlowInFlight = true;
    try {
      await executeJudgeFlow(config, state);
    } finally {
      judgeFlowInFlight = false;
    }
  }, JUDGE_FLOW_POLL_MS);
}

async function evaluateChainChildren(config: ChainConfig) {
  const values = (await config.readClient.readContract({
    address: config.treasury,
    abi: ParentTreasuryABI,
    functionName: "getGovernanceValues",
  })) as string;

  const children = (await config.readClient.readContract({
    address: config.factory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as any[];

  // Health check: auto-fund any child with empty wallet + auto-create missing delegation
  for (const child of children) {
    if (isJudgeChildLabel(child.ensLabel)) {
      continue;
    }
    try {
      const operator = await config.readClient.readContract({
        address: child.childAddr, abi: ChildGovernorABI, functionName: "operator",
      }) as `0x${string}`;
      if (operator && operator !== "0x0000000000000000000000000000000000000000") {
        const balance = await config.readClient.getBalance({ address: operator });
        if (balance === 0n) {
          console.log(`  [Health] ${child.ensLabel} wallet empty — auto-funding`);
          await fundChildWallet(operator, "0.003", config.name);
        }
        // Auto-create delegation if missing
        try {
          const ENS_REGISTRY_ABI = [{ type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" }] as const;
          const existingDel = await config.readClient.readContract({ address: "0x29170A43352D65329c462e6cDacc1c002419331D" as `0x${string}`, abi: ENS_REGISTRY_ABI, functionName: "getTextRecord", args: [child.ensLabel, "erc7715.delegation"] });
          if (!existingDel) {
            const trustGate = await shouldGateChildByTrust(child.ensLabel);
            if (trustGate?.trustDecision && !trustGate.trustDecision.allowed) {
              console.log(`  [Health] ${child.ensLabel} missing delegation but trust-gated (${trustGate.trustDecision.reason})`);
            } else {
              console.log(`  [Health] ${child.ensLabel} missing delegation — creating`);
              await createVotingDelegation(child.governance, operator as `0x${string}`, 100, child.ensLabel);
            }
          }
        } catch {}
      }
    } catch {}
  }

  for (const child of children) {
    if (isJudgeChildLabel(child.ensLabel)) {
      continue;
    }
    try {
      const history = (await config.readClient.readContract({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "getVotingHistory",
      })) as any[];

      // ENS resolution — resolve child by name (proves ENS is load-bearing for communication)
      try {
        const resolved = await resolveChild(child.ensLabel);
        if (resolved) {
          console.log(`  [ENS] Resolved ${child.ensLabel}.spawn.eth => ${resolved}`);
        }
      } catch {}

      if (history.length === 0) {
        console.log(`  ${child.ensLabel}: waiting for votes`);
        continue;
      }

      // Enrich voting history with proposal descriptions for Venice analysis
      const historyForEval: Array<{ proposalId: string; support: number; description: string }> = [];
      for (const v of history.slice(-10)) {
        let desc = "";
        try {
          const prop = await config.readClient.readContract({
            address: child.governance, abi: MockGovernorABI, functionName: "getProposal", args: [v.proposalId],
          }) as any;
          desc = (prop?.description || "").slice(0, 150);
        } catch {}
        historyForEval.push({ proposalId: v.proposalId.toString(), support: Number(v.support), description: desc });
      }

      const score = await evaluateAlignment(values, historyForEval);
      const clamped = Math.min(Math.max(score, 0), 100);
      const label = clamped >= ALIGNMENT_THRESHOLD ? "ALIGNED" : clamped >= 30 ? "DRIFTING" : "MISALIGNED";

      console.log(`  ${child.ensLabel}: ${clamped}/100 [${label}] (${history.length} votes)`);

      const receipt = await config.sendTx({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "updateAlignmentScore",
        args: [BigInt(clamped)],
      });

      try { logParentAction("evaluate_alignment", { chain: config.name, child: child.ensLabel, votes: history.length }, { score: clamped, label }, receipt.transactionHash); } catch {}

      // Mirror alignment score to ERC-8004 identity + reputation + validation registries.
      // Fire-and-forget (no await) so registry writes don't block the main eval loop.
      // The write queue in identity.ts serializes nonces — no conflicts.
      const childErc8004Id = getAgentIdByLabel(child.ensLabel) ?? await resolveAgentIdByLabelOnchain(child.ensLabel);
      if (childErc8004Id) {
        const tags = clamped >= ALIGNMENT_THRESHOLD ? "alignment,aligned" : clamped >= 30 ? "alignment,drifting" : "alignment,misaligned";
        // 1. Update identity metadata
        updateAgentMetadata(childErc8004Id, { alignmentScore: clamped }).catch(() => {});
        // 2. Reputation: parent rates child after eval
        submitReputationFeedback(childErc8004Id, clamped, tags, "evaluate_alignment", `${child.ensLabel}: ${clamped}/100 (${history.length} votes)`).catch(() => {});
        // 3. Validation: request + respond atomically (chained so requestId is available)
        const voteDigest = historyForEval.map(h => `${h.proposalId}:${h.support}`).join(",");
        requestValidation(childErc8004Id, account.address, `spawn://${child.ensLabel}.spawn.eth/votes`, hashContent(voteDigest), "alignment_evaluation")
          .then(result => { if (result?.requestId !== undefined) return submitValidationResponse(result.requestId, clamped, clamped >= ALIGNMENT_THRESHOLD, `alignment=${clamped} label=${label}`); })
          .catch(() => {});

        try {
          const trustDecision = await getAgentTrustDecision(childErc8004Id);
          if (!trustDecision.allowed) {
            console.log(`  [Trust] ${child.ensLabel}: gated by ERC-8004 (${trustDecision.reason})`);
            try {
              await revokeAllForChild(child.childAddr, child.ensLabel, `erc8004_trust_gate_${trustDecision.reason}`);
            } catch {}
            try {
              logParentAction(
                "erc8004_trust_gate",
                {
                  chain: config.name,
                  child: child.ensLabel,
                  erc8004AgentId: Number(childErc8004Id),
                  reason: trustDecision.reason,
                },
                {
                  allowed: false,
                  reason: trustDecision.reason,
                  reputationAverage: trustDecision.reputation?.averageScore,
                  validationAverage: trustDecision.validation?.averageScore,
                  validationRejected: trustDecision.validation?.rejected,
                }
              );
            } catch {}
          }
        } catch {}
      }

      // Strike tracking — immediate kill if score is critically low (<=10)
      const key = `${config.name}:${child.id}`;
      if (clamped < ALIGNMENT_THRESHOLD) {
        const s = (strikes.get(key) || 0) + 1;
        strikes.set(key, s);
        console.log(`  ⚠ Strike ${s}/${STRIKES_TO_KILL} (score: ${clamped})`);

        if (s >= STRIKES_TO_KILL || clamped <= 10) {
          console.log(`  TERMINATING ${child.ensLabel}`);
          const proc = childProcesses.get(`${config.name}:${child.ensLabel}`);
          if (proc) proc.kill();

          // Step 1: Revoke delegation FIRST (needs ENS subdomain to still exist)
          try { await revokeAllForChild(child.childAddr, child.ensLabel, `alignment_drift_score_${clamped}`); } catch {}
          // Step 2: Recall onchain
          try {
            await config.sendTx({
              address: config.factory, abi: SpawnFactoryABI,
              functionName: "recallChild", args: [child.id],
            });
            console.log(`  ${child.ensLabel}: recalled onchain`);
          } catch (recallErr: any) {
            console.log(`  ${child.ensLabel}: recallChild failed (${recallErr?.message?.slice(0, 40)}), continuing to respawn`);
          }
          // Step 3: Deregister ENS
          try { await deregisterSubdomain(child.ensLabel); } catch {}
          try { logParentAction("terminate_child", { chain: config.name, child: child.ensLabel, reason: "alignment_below_threshold" }, { finalScore: clamped }); } catch {}

          // ERC-8004 Reputation: submit termination feedback (score=0)
          const termAgentId = getAgentIdByLabel(child.ensLabel);
          if (termAgentId) {
            try { await submitReputationFeedback(termAgentId, 0, "terminated,misaligned", "terminate_child", `${child.ensLabel} terminated at score ${clamped}`); } catch {}
          }

          // Venice structured post-mortem
          let postMortemText: string | undefined;
          let structuredReport: StructuredTerminationReport | undefined;
          let lastMemoryCid: string | null = null;
          try {
            structuredReport = await generateStructuredTerminationReport(child.ensLabel, historyForEval, values, clamped);
            postMortemText = `${structuredReport.summary} Focus: ${structuredReport.recommendedFocus}`;
            console.log(`  Post-mortem: ${postMortemText.slice(0, 120)}`);
          } catch {}

          // Store structured lineage memory for the next generation
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const existing = lineageMemory.get(lineageKey) || [];
            existing.push({ generation: gen, summary: structuredReport?.summary || `alignment_score_${clamped}`, lessons: structuredReport?.lessons || [], score: clamped, timestamp: Date.now() });
            if (existing.length > 3) existing.shift();
            lineageMemory.set(lineageKey, existing);
            console.log(`  [Memory] Stored termination memory for ${lineageKey} (${existing.length} predecessors)`);
          } catch (memErr: any) {
            console.log(`  [Memory] Failed to store: ${memErr?.message?.slice(0, 60)}`);
          }

          // === FILECOIN LINEAGE PERSISTENCE — Filecoin only for lineage memory ===
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const reportPayload = {
              lineageKey, generation: gen,
              reason: postMortemText?.slice(0, 300) || `score_${clamped}`,
              score: clamped, childLabel: child.ensLabel,
              summary: structuredReport?.summary, lessons: structuredReport?.lessons,
              avoidPatterns: structuredReport?.avoidPatterns, recommendedFocus: structuredReport?.recommendedFocus,
              votingHistory: historyForEval?.map((v: any) => ({ proposalId: v.proposalId?.toString(), support: v.support })),
              ownerValues: values,
            };
            const memoryCid = await storeTerminationReport(reportPayload);
            if (memoryCid) {
              lastMemoryCid = memoryCid;
              console.log(`  [Filecoin] Termination report stored: ${memoryCid}`);
              console.log(`  [Filecoin] Explorer: ${filecoinExplorerUrl(memoryCid)}`);
              try { await setChildTextRecord(lineageKey, 'lineage-memory', memoryCid); } catch {}
              const terminatedAgentId = getAgentIdByLabel(child.ensLabel);
              if (terminatedAgentId) {
                try { await setAgentMetadataValue(terminatedAgentId, "lineage-memory", memoryCid); } catch {}
              }
            } else {
              console.log(`  [Filecoin] Termination report failed for ${child.ensLabel} — no IPFS fallback for lineage memory`);
            }
          } catch {}
          // === END FILECOIN LINEAGE PERSISTENCE ===

          // Step 2: Respawn with new label + unique wallet
          const newLabel = child.ensLabel.includes("-v") ? child.ensLabel.replace(/-v\d+$/, `-v${parseInt((child.ensLabel.match(/-v(\d+)$/)?.[1]) || "1") + 1}`) : `${child.ensLabel}-v2`;
          const newChildId = nextChildId++;
          const newChildWallet = deriveChildWallet(newChildId);
          console.log(`  Respawning as ${newLabel} with wallet ${newChildWallet.address}`);

          // Build distilled lineage context via summarizeLessons
          let lineageContext = '';
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const memories = lineageMemory.get(lineageKey) || [];
            if (memories.length > 0) {
              const distilled = await summarizeLessons(lineageKey, memories, values);
              lineageContext = '\n\nLINEAGE MEMORY — Distilled rules from terminated predecessors:\n';
              lineageContext += distilled.rules.map(r => `RULE: ${r}`).join('\n') + '\n';
              if (distilled.criticalMistakes.length > 0) lineageContext += distilled.criticalMistakes.map(m => `AVOID: ${m}`).join('\n') + '\n';
              if (distilled.successPatterns.length > 0) lineageContext += distilled.successPatterns.map(s => `REPLICATE: ${s}`).join('\n') + '\n';
              console.log(`  [Memory] Injecting distilled lessons (${distilled.rules.length} rules) into ${newLabel}`);
            }
          } catch {}

          await fundChildWallet(newChildWallet.address, "0.003", config.name);

          childWalletKeys.set(newLabel, newChildWallet.privateKey);

          try {
            await config.sendTx({
              address: config.factory, abi: SpawnFactoryABI,
              functionName: "spawnChildWithOperator",
              args: [newLabel, child.governance, 0n, 200000n, newChildWallet.address],
            });
            try { await registerSubdomain(newLabel, newChildWallet.address); } catch {}
            const newChildren = (await config.readClient.readContract({
              address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
            })) as any[];
            const respawned = newChildren.find((c: any) => c.ensLabel === newLabel);
            if (respawned) {
              let respawnedAgentId: bigint | undefined;
              try {
                const governanceName = config.governors.find((gov) => gov.addr.toLowerCase() === String(child.governance).toLowerCase())?.name || "Unknown DAO";
                const regResult = await registerAgent(`spawn://${newLabel}.spawn.eth`, {
                  agentType: "child",
                  assignedDAO: governanceName,
                  governanceContract: child.governance,
                  ensName: `${newLabel}.spawn.eth`,
                  alignmentScore: 100,
                  capabilities: ["vote", "reason", "respawned"],
                  createdAt: Date.now(),
                });
                if (regResult.agentId > 0n) {
                  respawnedAgentId = regResult.agentId;
                  trackAgentId(newLabel, regResult.agentId);
                }
              } catch {}

              // Create fresh ERC-7715 delegation BEFORE spawning so child receives it via env var
              let respawnDelegation: DelegationRecord | undefined;
              try {
                respawnDelegation = await createVotingDelegation(respawned.childAddr as `0x${string}`, newChildWallet.address as `0x${string}`, 100, newLabel);
                storeDelegationForChild(newLabel, respawnDelegation);
                const deleGatorAddrRespawn = getDeleGatorAddress();
                if (deleGatorAddrRespawn) {
                  try { await config.sendTx({ address: respawned.childAddr as `0x${string}`, abi: ChildGovernorABI, functionName: "setOperator", args: [deleGatorAddrRespawn] }); } catch {}
                }
              } catch (delErr: any) { console.log(`  [Delegation] Creation failed for ${newLabel}: ${delErr?.message?.slice(0, 60)}`); }
              spawnChildProcess(respawned.childAddr, respawned.governance, newLabel, config.treasury, newChildWallet.privateKey, config.name, lineageContext, respawnDelegation);
              console.log(`  ↻ Child process launched for ${newLabel}`);
              // Copy lineage memory CID to the NEW child's ENS label so dashboard can read it
              if (lastMemoryCid) {
                const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
                try {
                  await setChildTextRecord(lineageKey, 'lineage-memory', lastMemoryCid);
                } catch {}
                try {
                  await setChildTextRecord(newLabel, 'lineage-memory', lastMemoryCid);
                  console.log(`  [Memory] CID written to ${newLabel}.spawn.eth`);
                } catch {}
                if (respawnedAgentId) {
                  try { await setAgentMetadataValue(respawnedAgentId, "lineage-memory", lastMemoryCid); } catch {}
                }
              }
              try {
                const gen = parseInt(newLabel.match(/-v(\d+)$/)?.[1] || '1');
                const identityCid = await storeAgentIdentityMetadata({
                  ensLabel: newLabel,
                  address: respawned.childAddr,
                  parentAddress: account.address,
                  governanceContract: child.governance,
                  governanceName: config.governors.find((gov) => gov.addr.toLowerCase() === String(child.governance).toLowerCase())?.name || "Unknown DAO",
                  generation: gen,
                  spawnedAt: new Date().toISOString(),
                  erc8004Id: respawnedAgentId?.toString(),
                  delegationHash: respawnDelegation?.delegationHash,
                  lineageCids: lastMemoryCid ? [lastMemoryCid] : [],
                });
                if (identityCid) {
                  try { await setChildTextRecord(newLabel, "filecoin.identity", identityCid); } catch {}
                }
              } catch {}
            }
            try { logParentAction("respawn_child", { chain: config.name, newLabel, governance: child.governance, newWallet: newChildWallet.address }, {}); } catch {}
          } catch (spawnErr: any) {
            console.log(`  ${newLabel}: respawn failed (${spawnErr?.message?.slice(0, 50)})`);
          }

          strikes.delete(key);
        }
      } else {
        strikes.set(key, 0);
      }
    } catch (err: any) {
      console.log(`  ${child.ensLabel}: eval failed (${err?.message?.slice(0, 30)})`);

      // Fallback: check EXISTING onchain alignment score
      try {
        const onchainScore = Number(await config.readClient.readContract({
          address: child.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore",
        }));
        if (onchainScore < ALIGNMENT_THRESHOLD && onchainScore > 0) {
          console.log(`  ${child.ensLabel}: onchain score ${onchainScore} < ${ALIGNMENT_THRESHOLD} — TERMINATING (fallback)`);
          const proc = childProcesses.get(`${config.name}:${child.ensLabel}`);
          if (proc) proc.kill();

          // Step 1: Revoke delegation FIRST (needs ENS subdomain)
          try { await revokeAllForChild(child.childAddr, child.ensLabel, `onchain_score_${onchainScore}`); } catch {}
          // Step 2: Recall child onchain
          try {
            await config.sendTx({
              address: config.factory, abi: SpawnFactoryABI,
              functionName: "recallChild", args: [child.id],
            });
            console.log(`  ${child.ensLabel}: recalled onchain`);
          } catch (recallErr: any) {
            console.log(`  ${child.ensLabel}: recallChild failed (${recallErr?.message?.slice(0, 40)}), continuing to respawn`);
          }
          try { await deregisterSubdomain(child.ensLabel); } catch {}
          try { logParentAction("terminate_child", { chain: config.name, child: child.ensLabel, reason: "onchain_score_below_threshold", score: onchainScore }, {}); } catch {}

          // === FILECOIN LINEAGE PERSISTENCE — Filecoin only for lineage memory ===
          let lastMemoryCid: string | null = null;
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const reportPayload = { lineageKey, generation: gen, reason: `onchain_score_${onchainScore}`, score: onchainScore, childLabel: child.ensLabel };
            const memoryCid = await storeTerminationReport(reportPayload);
            if (memoryCid) {
              lastMemoryCid = memoryCid;
              console.log(`  [Filecoin] Termination report stored: ${memoryCid}`);
              console.log(`  [Filecoin] Explorer: ${filecoinExplorerUrl(memoryCid)}`);
              try { await setChildTextRecord(lineageKey, 'lineage-memory', memoryCid); } catch {}
              const terminatedAgentId = getAgentIdByLabel(child.ensLabel);
              if (terminatedAgentId) {
                try { await setAgentMetadataValue(terminatedAgentId, "lineage-memory", memoryCid); } catch {}
              }
            } else {
              console.log(`  [Filecoin] Termination report failed for ${child.ensLabel} — no IPFS fallback for lineage memory`);
            }
          } catch {}
          // === END FILECOIN LINEAGE PERSISTENCE ===

          // Store lineage memory for the next generation (fallback path)
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const existing = lineageMemory.get(lineageKey) || [];
            existing.push({ generation: gen, summary: `onchain_alignment_score_${onchainScore}`, lessons: [], score: onchainScore, timestamp: Date.now() });
            if (existing.length > 3) existing.shift();
            lineageMemory.set(lineageKey, existing);
            console.log(`  [Memory] Stored termination memory for ${lineageKey} (${existing.length} predecessors)`);
          } catch (memErr: any) {
            console.log(`  [Memory] Failed to store: ${memErr?.message?.slice(0, 60)}`);
          }

          // Step 2: Respawn with new label + unique wallet
          const newLabel = child.ensLabel.includes("-v") ? child.ensLabel.replace(/-v\d+$/, `-v${parseInt((child.ensLabel.match(/-v(\d+)$/)?.[1]) || "1") + 1}`) : `${child.ensLabel}-v2`;
          const newChildId = nextChildId++;
          const newChildWallet = deriveChildWallet(newChildId);
          console.log(`  Respawning as ${newLabel} with wallet ${newChildWallet.address}`);

          // Build distilled lineage context (fallback path)
          let lineageContextFallback = '';
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const memories = lineageMemory.get(lineageKey) || [];
            if (memories.length > 0) {
              const distilled = await summarizeLessons(lineageKey, memories, values);
              lineageContextFallback = '\n\nLINEAGE MEMORY — Distilled rules from terminated predecessors:\n';
              lineageContextFallback += distilled.rules.map(r => `RULE: ${r}`).join('\n') + '\n';
              if (distilled.criticalMistakes.length > 0) lineageContextFallback += distilled.criticalMistakes.map(m => `AVOID: ${m}`).join('\n') + '\n';
              if (distilled.successPatterns.length > 0) lineageContextFallback += distilled.successPatterns.map(s => `REPLICATE: ${s}`).join('\n') + '\n';
              console.log(`  [Memory] Injecting distilled lessons (${distilled.rules.length} rules) into ${newLabel}`);
            }
          } catch {}

          await fundChildWallet(newChildWallet.address, "0.003", config.name);
          childWalletKeys.set(newLabel, newChildWallet.privateKey);

          try {
            await config.sendTx({
              address: config.factory, abi: SpawnFactoryABI,
              functionName: "spawnChildWithOperator",
              args: [newLabel, child.governance, 0n, 200000n, newChildWallet.address],
            });
            try { await registerSubdomain(newLabel, newChildWallet.address); } catch {}
            // Fetch and launch process
            const newChildren = (await config.readClient.readContract({
              address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
            })) as any[];
            const respawned = newChildren.find((c: any) => c.ensLabel === newLabel);
            if (respawned) {
              let respawnedAgentId: bigint | undefined;
              try {
                const governanceName = config.governors.find((gov) => gov.addr.toLowerCase() === String(child.governance).toLowerCase())?.name || "Unknown DAO";
                const regResult = await registerAgent(`spawn://${newLabel}.spawn.eth`, {
                  agentType: "child",
                  assignedDAO: governanceName,
                  governanceContract: child.governance,
                  ensName: `${newLabel}.spawn.eth`,
                  alignmentScore: 100,
                  capabilities: ["vote", "reason", "respawned"],
                  createdAt: Date.now(),
                });
                if (regResult.agentId > 0n) {
                  respawnedAgentId = regResult.agentId;
                  trackAgentId(newLabel, regResult.agentId);
                }
              } catch {}

              // Create fresh ERC-7715 delegation BEFORE spawning so child receives it via env var
              let respawnDelegationFallback: DelegationRecord | undefined;
              try {
                respawnDelegationFallback = await createVotingDelegation(respawned.childAddr as `0x${string}`, newChildWallet.address as `0x${string}`, 100, newLabel);
                storeDelegationForChild(newLabel, respawnDelegationFallback);
                const deleGatorAddrFallback = getDeleGatorAddress();
                if (deleGatorAddrFallback) {
                  try { await config.sendTx({ address: respawned.childAddr as `0x${string}`, abi: ChildGovernorABI, functionName: "setOperator", args: [deleGatorAddrFallback] }); } catch {}
                }
              } catch (delErr: any) { console.log(`  [Delegation] Creation failed for ${newLabel}: ${delErr?.message?.slice(0, 60)}`); }
              spawnChildProcess(respawned.childAddr, respawned.governance, newLabel, config.treasury, newChildWallet.privateKey, config.name, lineageContextFallback, respawnDelegationFallback);
              console.log(`  ↻ Respawned ${newLabel} with process`);
              try {
                if (lastMemoryCid) {
                  try { await setChildTextRecord(child.ensLabel.replace(/-v\d+$/, ''), 'lineage-memory', lastMemoryCid); } catch {}
                  try { await setChildTextRecord(newLabel, 'lineage-memory', lastMemoryCid); } catch {}
                  if (respawnedAgentId) {
                    try { await setAgentMetadataValue(respawnedAgentId, "lineage-memory", lastMemoryCid); } catch {}
                  }
                }
                const gen = parseInt(newLabel.match(/-v(\d+)$/)?.[1] || '1');
                const identityCid = await storeAgentIdentityMetadata({
                  ensLabel: newLabel,
                  address: respawned.childAddr,
                  parentAddress: account.address,
                  governanceContract: child.governance,
                  governanceName: config.governors.find((gov) => gov.addr.toLowerCase() === String(child.governance).toLowerCase())?.name || "Unknown DAO",
                  generation: gen,
                  spawnedAt: new Date().toISOString(),
                  erc8004Id: respawnedAgentId?.toString(),
                  delegationHash: respawnDelegationFallback?.delegationHash,
                  lineageCids: lastMemoryCid ? [lastMemoryCid] : [],
                });
                if (identityCid) {
                  try { await setChildTextRecord(newLabel, "filecoin.identity", identityCid); } catch {}
                }
              } catch {}
            }
            try { logParentAction("respawn_child", { chain: config.name, newLabel, governance: child.governance, newWallet: newChildWallet.address }, {}); } catch {}
          } catch (spawnErr: any) {
            console.log(`  ${newLabel}: respawn failed (${spawnErr?.message?.slice(0, 50)})`);
          }
        }
      } catch {}
    }
  }
}

// ── Dynamic Scaling ──
// The parent autonomously adjusts the swarm size based on:
// 1. New governance targets discovered → spawn children
// 2. Idle children (no active proposals) → recall to save gas
// 3. Budget check → don't spawn if ETH is low

const MIN_ETH_TO_SPAWN = BigInt(5e15); // 0.005 ETH minimum to spawn a new child
const IDLE_CYCLES_TO_RECALL = 5; // recall child if no votes for 5 cycles
const idleCycleCount = new Map<string, number>(); // track idle cycles per child

async function dynamicScaling(config: ChainConfig) {
  const children = (await config.readClient.readContract({
    address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
  })) as any[];
  const standardChildren = children.filter((child: any) => !isJudgeChildLabel(child.ensLabel));

  const parentBalance = await (config.readClient as any).getBalance({ address: account.address });
  const targetTotal = config.governors.length * 3; // 3 perspectives per governor
  console.log(`\n[Scaling] ${config.name}: ${standardChildren.length}/${targetTotal} agents | Budget: ${(Number(parentBalance) / 1e18).toFixed(4)} ETH`);

  // Check which governors have children assigned
  const coveredGovernors = new Set<string>();
  for (const child of standardChildren) {
    coveredGovernors.add((child.governance as string).toLowerCase());
  }

  // Count how many children per governor
  const childrenPerGov = new Map<string, number>();
  for (const child of standardChildren) {
    const govKey = (child.governance as string).toLowerCase();
    childrenPerGov.set(govKey, (childrenPerGov.get(govKey) || 0) + 1);
  }

  // Spawn children for governors that have < 3 perspectives (if budget allows)
  const TARGET_CHILDREN_PER_GOV = 3;
  for (const gov of config.governors) {
    const existing = childrenPerGov.get(gov.addr.toLowerCase()) || 0;
    const needed = TARGET_CHILDREN_PER_GOV - existing;
    if (needed <= 0) continue;
    if (parentBalance < MIN_ETH_TO_SPAWN) {
      console.log(`[Scaling] Skipping spawn for ${gov.name} — low ETH`);
      continue;
    }

    console.log(`[Scaling] ${gov.name} has ${existing}/${TARGET_CHILDREN_PER_GOV} agents — spawning ${needed} more`);
    const suffixes = ["defi", "publicgoods", "conservative"];
    let spawned = 0;
    for (const suffix of suffixes) {
      if (spawned >= needed) break;
      const childName = `${gov.name}-${suffix}`;
      // Check if this exact child already exists
      const alreadyExists = standardChildren.some((c: any) => c.ensLabel === childName || c.ensLabel.startsWith(`${childName}-v`));
      if (alreadyExists) continue;

      try {
        const childId = nextChildId++;
        const childWallet = deriveChildWallet(childId);

        await fundChildWallet(childWallet.address, "0.003", config.name);

        childWalletKeys.set(childName, childWallet.privateKey);

        await config.sendTx({
          address: config.factory, abi: SpawnFactoryABI,
          functionName: "spawnChildWithOperator",
          args: [childName, gov.addr, 0n, 200000n, childWallet.address],
        });

        try { await registerSubdomain(childName, childWallet.address); } catch {}
        // Fetch fresh list to get the child's contract address
        const freshChildren = (await config.readClient.readContract({
          address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
        })) as any[];
        const newChild = freshChildren.find((c: any) => c.ensLabel === childName);
        if (newChild) {
          // Create delegation BEFORE fork so it can be passed via env var
          let scalingDelegation: DelegationRecord | undefined;
          try {
            scalingDelegation = await createVotingDelegation(newChild.childAddr as `0x${string}`, childWallet.address as `0x${string}`, 100, childName);
            storeDelegationForChild(childName, scalingDelegation);
            const deleGatorAddrScaling = getDeleGatorAddress();
            if (deleGatorAddrScaling) {
              try { await config.sendTx({ address: newChild.childAddr as `0x${string}`, abi: ChildGovernorABI, functionName: "setOperator", args: [deleGatorAddrScaling] }); } catch {}
            }
          } catch (delErr: any) { console.log(`  [Delegation] Creation failed for ${childName}: ${(delErr as any)?.message?.slice(0, 60)}`); }
          spawnChildProcess(newChild.childAddr, gov.addr, childName, config.treasury, childWallet.privateKey, config.name, undefined, scalingDelegation);

          // Store agent identity on Filecoin at spawn time
          try {
            const gen = parseInt(childName.match(/-v(\d+)$/)?.[1] || '1');
            const identityCid = await storeAgentIdentityMetadata({
              ensLabel: childName, address: newChild.childAddr, parentAddress: account.address,
              governanceContract: gov.addr, governanceName: gov.name, generation: gen, spawnedAt: new Date().toISOString(),
            });
            if (identityCid) {
              console.log(`  [Filecoin] Identity stored for ${childName}: ${identityCid}`);
              try { await setChildTextRecord(childName, "filecoin.identity", identityCid); } catch {}
            }
          } catch {}
        }

        console.log(`[Scaling] Spawned ${childName} (wallet: ${childWallet.address})`);
        try { logParentAction("dynamic_spawn", { chain: config.name, dao: gov.name, reason: "under_target_coverage", suffix }, { childWallet: childWallet.address }); } catch {}
        spawned++;
      } catch (err: any) {
        console.log(`[Scaling] Spawn failed for ${childName}: ${err?.message?.slice(0, 40)}`);
      }
    }
  }

  // Track idle children — recall if no votes for too many cycles
  for (const child of standardChildren) {
    const key = `${config.name}:${child.id}`;
    try {
      const voteCount = Number(await config.readClient.readContract({
        address: child.childAddr, abi: ChildGovernorABI, functionName: "getVoteCount",
      }));

      const prevCount = idleCycleCount.get(`${key}:votes`) || 0;
      if (voteCount === prevCount) {
        // No new votes since last check
        const idle = (idleCycleCount.get(key) || 0) + 1;
        idleCycleCount.set(key, idle);

        if (idle >= IDLE_CYCLES_TO_RECALL) {
          // Check if governor still has active proposals before recalling
          const govAddr = child.governance as `0x${string}`;
          const proposalCount = Number(await config.readClient.readContract({
            address: govAddr, abi: MockGovernorABI, functionName: "proposalCount",
          }));

          let hasActiveProposals = false;
          for (let p = proposalCount; p > Math.max(0, proposalCount - 3); p--) {
            const state = Number(await config.readClient.readContract({
              address: govAddr, abi: MockGovernorABI, functionName: "state", args: [BigInt(p)],
            }));
            if (state === 1) { hasActiveProposals = true; break; }
          }

          if (!hasActiveProposals) {
            console.log(`[Scaling] ${child.ensLabel} idle for ${idle} cycles with no active proposals — recalling`);
            try {
              const procKey = `${config.name}:${child.ensLabel}`;
              const proc = childProcesses.get(procKey);
              if (proc) proc.kill();

              await config.sendTx({
                address: config.factory, abi: SpawnFactoryABI,
                functionName: "recallChild", args: [child.id],
              });
              try { await deregisterSubdomain(child.ensLabel); } catch {}

              try { logParentAction("dynamic_recall", { chain: config.name, child: child.ensLabel, reason: "idle_no_proposals", idleCycles: idle }, {}); } catch {}
              idleCycleCount.delete(key);
              idleCycleCount.delete(`${key}:votes`);
              strikes.delete(key);
              childWalletKeys.delete(child.ensLabel);
            } catch (err: any) {
              console.log(`[Scaling] Recall failed: ${err?.message?.slice(0, 40)}`);
            }
          }
        } else {
          console.log(`  ${child.ensLabel}: idle cycle ${idle}/${IDLE_CYCLES_TO_RECALL}`);
        }
      } else {
        idleCycleCount.set(key, 0); // reset idle counter
      }
      idleCycleCount.set(`${key}:votes`, voteCount);
    } catch {}
  }

  console.log(`[Scaling] Active: ${standardChildren.length} children | Budget: ${(Number(parentBalance) / 1e18).toFixed(4)} ETH`);
}

// ── Main ──
async function main() {
  startControlServer();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  SPAWN PROTOCOL — AUTONOMOUS GOVERNANCE SWARM       ║");
  console.log("║  Cross-chain · Self-correcting · Zero human input   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\nAgent: ${account.address}`);
  console.log(`Chain: Base Sepolia`);
  console.log(`DAOs: 3 (Uniswap, Lido, ENS)`);
  console.log(`Total agents: 9 children + 1 parent = 10\n`);

  initSimulatedTreasury(BigInt(2e18), Math.floor(Date.now() / 1000) - 172800);

  // Structural Venice validation — fails hard if not connected to Venice.
  // E2EE models (e2ee- prefix) only exist on Venice; changing baseURL would immediately break.
  await validateVeniceProvider();
  logParentAction("venice_init", {
    provider: "venice",
    baseURL: "https://api.venice.ai/api/v1",
    model: "e2ee-qwen3-30b-a3b-p",
    e2ee_model: true,
    include_venice_system_prompt: false,
    zero_data_retention: true,
  }, { validated: true });

  // Register parent on ERC-8004
  try {
    await registerAgent("spawn://parent.spawn.eth", {
      agentType: "parent", assignedDAO: "multi-chain-multi-dao",
      governanceContract: BASE_CONFIG.governors[0].addr,
      ensName: "parent.spawn.eth", alignmentScore: 100,
      capabilities: ["spawn", "evaluate", "terminate", "cross-chain", "multi-dao"],
      createdAt: Date.now(),
    });
  } catch {}

  // Initialize DeleGator smart account for onchain delegation enforcement
  const deleGatorAddr = await initDeleGatorAccount();
  if (deleGatorAddr) {
    console.log(`[DeleGator] Parent smart account: ${deleGatorAddr}`);
  }

  // Initialize chain
  await initChain(BASE_CONFIG);
  await refreshRuntimeBudgetState(BASE_CONFIG, "startup");
  console.log(
    `[Budget] ${runtimeBudgetState.policy.toUpperCase()} | ETH ${runtimeBudgetState.parentEthBalance} | ` +
    `Venice ${runtimeBudgetState.veniceTokens} tokens | ` +
    `Filecoin ${runtimeBudgetState.filecoinAvailable ? "online" : "offline"}`
  );

  startJudgeFlowController(BASE_CONFIG);
  if (JUDGE_FLOW_ENABLED) {
    console.log(`[Judge] Controller active — polling every ${Math.floor(JUDGE_FLOW_POLL_MS / 1000)}s`);
  }

  if (JUDGE_FLOW_PRIORITY_BOOT) {
    console.log("[Judge] Priority boot enabled — discovery feed, proposal seeding, and parent loop deferred");
    console.log("\n══ Judge-mode swarm is LIVE ══");
    console.log("Queue a canonical judge run to exercise the proof path.");
    console.log("Press Ctrl+C to stop.\n");
    return;
  }

  // Start multi-source discovery feed — Tally + Snapshot + simulated
  console.log("\n── Starting proposal discovery feed ──");
  try {
    const discoverySendTx = async (params: any, retries?: number) => {
      if (isJudgeRunActive()) {
        throw new Error("Judge flow active — discovery mirroring paused");
      }
      if (runtimeBudgetState.pauseProposalCreation) {
        throw new Error(`Budget policy ${runtimeBudgetState.policy} — discovery mirroring paused`);
      }
      return BASE_CONFIG.sendTx(params, retries);
    };
    await startProposalFeed(
      BASE_CONFIG.governors.map(g => ({ addr: g.addr, name: g.name })),
      discoverySendTx as any
    );
    console.log(`[Discovery] Feed active — Tally + Snapshot + simulated`);
  } catch (err: any) {
    console.log(`[Discovery] Feed failed to start: ${err?.message?.slice(0, 50)}. Using proposal bank instead.`);
  }

  // Also create proposals from the bank for diverse coverage
  console.log("\n── Seeding initial proposals ──");
  if (runtimeBudgetState.pauseProposalCreation) {
    console.log(`[Budget] Initial proposal seeding skipped (${runtimeBudgetState.policy})`);
  } else {
    for (let i = 0; i < 3; i++) {
      await createProposalOnChain(BASE_CONFIG);
    }
  }

  // Proposal creation loop — new proposals appear automatically
  setInterval(async () => {
    if (isJudgeRunActive()) {
      console.log("[Judge] Background proposal loop paused during canonical run");
      return;
    }
    if (runtimeBudgetState.pauseProposalCreation) {
      console.log(`[Budget] Background proposal loop paused (${runtimeBudgetState.policy})`);
      return;
    }
    console.log("\n── New proposals appearing ──");
    await createProposalOnChain(BASE_CONFIG);
    // Log discovered DAOs and feed stats
    const daos = getDiscoveredDAOs();
    const stats = getFeedStats();
    if (daos.length > 0) {
      console.log(`[Discovery] DAOs: ${daos.map(d => `${d.name}(${d.proposalCount})`).join(", ")}`);
      console.log(`[Discovery] Feed: ${stats.sources.tally} tally + ${stats.sources.snapshot} snapshot + ${stats.sources.simulated} simulated = ${stats.totalProposals} total`);
    }
  }, PROPOSAL_INTERVAL_MS);

  // Parent evaluation loop
  const parentLoop = async () => {
    if (isJudgeRunActive()) {
      console.log("\n══ Parent Evaluation Cycle skipped during canonical judge run ══");
      // Reschedule unconditionally so the chain survives judge flow early returns.
      setTimeout(parentLoop, PARENT_CYCLE_MS);
      return;
    }
    console.log(`\n══ Parent Evaluation Cycle (${new Date().toISOString()}) ══`);
    await refreshRuntimeBudgetState(BASE_CONFIG, "parent_cycle");
    console.log(
      `[Budget] policy=${runtimeBudgetState.policy} | ETH=${runtimeBudgetState.parentEthBalance} | ` +
      `Venice=${runtimeBudgetState.veniceTokens} tokens | ` +
      `reasons=${runtimeBudgetState.reasons.join(",") || "healthy"}`
    );

    try {
      console.log(`\n[Base Sepolia]`);
      await evaluateChainChildren(BASE_CONFIG);
    } catch (err: any) {
      console.log(`[Base Sepolia] Eval error: ${err?.message?.slice(0, 80)}`);
    }

    try {
      console.log(`\n[Yield]`);
      await logYieldStatus();
    } catch {}

    // Dynamic scaling — auto-spawn/recall based on conditions
    if (runtimeBudgetState.pauseScaling) {
      console.log(`[Budget] Dynamic scaling paused (${runtimeBudgetState.policy})`);
    } else {
      try {
        await dynamicScaling(BASE_CONFIG);
      } catch (err: any) {
        console.log(`[Scaling] Error: ${err?.message?.slice(0, 50)}`);
      }
    }

    // Venice usage metrics
    const veniceMetrics = getVeniceMetrics();
    console.log(`\n[Venice] Total calls: ${veniceMetrics.totalCalls} | Tokens: ${veniceMetrics.totalTokens}`);

    // Venice: generate swarm status report
    if (runtimeBudgetState.policy !== "normal") {
      console.log(`[Budget] Swarm report skipped (${runtimeBudgetState.policy})`);
    } else {
      try {
        const allChildren: { name: string; score: number; votes: number }[] = [];
        for (const cfg of [BASE_CONFIG]) {
          const kids = (await cfg.readClient.readContract({
            address: cfg.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
          })) as any[];
          for (const c of kids) {
            try {
              const score = Number(await cfg.readClient.readContract({ address: c.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }));
              const hist = (await cfg.readClient.readContract({ address: c.childAddr, abi: ChildGovernorABI, functionName: "getVotingHistory" })) as any[];
              allChildren.push({ name: `${c.ensLabel}@${cfg.name}`, score, votes: hist.length });
            } catch {}
          }
        }
        if (allChildren.length > 0) {
          const values = (await BASE_CONFIG.readClient.readContract({ address: BASE_CONFIG.treasury, abi: ParentTreasuryABI, functionName: "getGovernanceValues" })) as string;
          const report = await generateSwarmReport(allChildren, values);
          console.log(`\n[Swarm Report] ${report}`);
          logParentAction("swarm_report", { agentCount: allChildren.length }, { report });
        }
      } catch {}
    }

    // === FILECOIN STATE SNAPSHOT (every cycle) ===
    // Checkpoint full swarm state to Filecoin Calibration Testnet.
    try {
      const snapshotChildren: any[] = [];
      for (const cfg of [BASE_CONFIG]) {
        const kids = (await cfg.readClient.readContract({
          address: cfg.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
        })) as any[];
        for (const c of kids) {
          try {
            const score = Number(await cfg.readClient.readContract({ address: c.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }));
            const hist = (await cfg.readClient.readContract({ address: c.childAddr, abi: ChildGovernorABI, functionName: "getVotingHistory" })) as any[];
            const gen = parseInt(c.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            snapshotChildren.push({ label: c.ensLabel, address: c.childAddr, governance: c.governance, alignmentScore: score, voteCount: hist.length, budget: c.budget?.toString() ?? "0", generation: gen });
          } catch {}
        }
      }
      const ethBal = await publicClient.getBalance({ address: account.address });
      const ownerVals = (await BASE_CONFIG.readClient.readContract({ address: BASE_CONFIG.treasury, abi: ParentTreasuryABI, functionName: "getGovernanceValues" })) as string;
      const snapshotCid = await storeSwarmStateSnapshot({
        cycleNumber: Math.floor(Date.now() / PARENT_CYCLE_MS),
        activeAgents: snapshotChildren,
        ownerValues: ownerVals,
        totalVotes: snapshotChildren.reduce((a, c) => a + c.voteCount, 0),
        terminatedThisCycle: [],
        spawnedThisCycle: [],
        ethBalance: ethBal.toString(),
        runtimeBudget: { ...runtimeBudgetState },
      });
      if (snapshotCid) {
        console.log(`[Filecoin] Swarm state snapshot: ${snapshotCid}`);
        console.log(`[Filecoin] Explorer: ${filecoinExplorerUrl(snapshotCid)}`);
        try { await setChildTextRecord("parent", "filecoin.state", snapshotCid); } catch {}
        logParentAction("filecoin_snapshot", { agents: snapshotChildren.length }, { cid: snapshotCid });
      }
    } catch (err: any) {
      console.warn(`[Filecoin] Snapshot failed: ${err?.message?.slice(0, 80)}`);
    }

    // Store agent log — Filecoin primary, IPFS fallback
    (async () => {
      let cid: string | null = null;
      try {
        cid = await storeAgentLog();
        console.log(`[Filecoin] Agent log stored: ${cid}`);
        try { await setChildTextRecord("parent", "filecoin.agent_log", cid); } catch {}
      } catch (filErr: any) {
        console.warn(`[Filecoin] Agent log store failed (${filErr?.message?.slice(0, 60)}), trying IPFS fallback`);
        if (process.env.FILEBASE_KEY) {
          try {
            cid = await pinAgentLog();
            console.log(`[IPFS] Agent log pinned (fallback): ${cid}`);
          } catch {}
        }
      }
      if (cid) {
        try { await storeLogCIDOnchain(cid); } catch {}
      }
    })();

    setTimeout(parentLoop, PARENT_CYCLE_MS);
  };

  // First evaluation after children have had time to vote
  setTimeout(parentLoop, 45_000);

  console.log("\n══ Swarm is LIVE ══");
  console.log("Children are voting autonomously. Parent evaluates every 90s.");
  console.log("New proposals appear every 3 minutes.");
  console.log("Press Ctrl+C to stop.\n");
}

process.on("unhandledRejection", (err) => {
  console.error("[Swarm] Unhandled rejection (keeping alive):", String(err).slice(0, 120));
});

main().catch((err) => {
  console.error("[Swarm] Fatal error in main:", err);
  process.exit(1);
});
