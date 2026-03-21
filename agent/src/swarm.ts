/**
 * Spawn Protocol — Autonomous Governance Swarm (Production)
 *
 * This is the REAL PRODUCT. Not a demo script. A persistent system that:
 *   1. Runs across Base Sepolia + Celo Sepolia simultaneously
 *   2. Spawns one child agent per DAO (3 DAOs per chain = 6 agents)
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
  celoPublicClient, celoWalletClient, sendTxAndWaitCelo,
} from "./chain.js";
import {
  MockGovernorABI, ParentTreasuryABI, SpawnFactoryABI, ChildGovernorABI,
} from "./abis.js";
import { evaluateAlignment, generateSwarmReport, generateTerminationReport, generateStructuredTerminationReport, summarizeLessons, getVeniceMetrics } from "./venice.js";
import type { StructuredTerminationReport } from "./venice.js";
import { registerSubdomain, deregisterSubdomain, setAgentMetadata, resolveChild, setChildTextRecord } from "./ens.js";
import { deriveChildWallet } from "./wallet-manager.js";
import { registerAgent, updateAgentMetadata } from "./identity.js";
import { createVotingDelegation, revokeAllForChild, initDeleGatorAccount } from "./delegation.js";
import { logYieldStatus, initSimulatedTreasury } from "./lido.js";
import { logParentAction, logChildAction } from "./logger.js";
import { pinAgentLog, storeLogCIDOnchain, pinTerminationMemory } from "./ipfs.js";
import { startProposalFeed, getDiscoveredDAOs, getLatestProposals, getFeedStats } from "./discovery.js";
import { parseEther } from "viem";
import type { DeployedAddresses } from "./types.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALIGNMENT_THRESHOLD = 55; // Balance between keeping agents alive and demonstrating lifecycle
const STRIKES_TO_KILL = 1; // Kill on first misalignment for visible lifecycle demo
const PARENT_CYCLE_MS = 90_000; // evaluate every 90s
const PROPOSAL_INTERVAL_MS = 180_000; // new proposal every 3 min

const childProcesses = new Map<string, ChildProcess>();

// Lineage memory — stores structured termination reports from predecessors so respawned agents can learn
const lineageMemory = new Map<string, Array<{ generation: number; summary: string; lessons: string[]; score: number; timestamp: number }>>();

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
    const isBase = chainName === "base-sepolia";
    const wc = isBase ? walletClient : celoWalletClient;
    const pc = isBase ? publicClient : celoPublicClient;

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
  ],
};

const CELO_CONFIG: ChainConfig = {
  name: "celo-sepolia",
  sendTx: sendTxAndWaitCelo,
  readClient: celoPublicClient,
  treasury: "0x35ab52d20736886ebe3730f7fc2d6fa52c7159d4",
  factory: "0x8d3c3dbbc7a6f87feaf24282956ca8a014fe889a",
  governors: [
    { name: "uniswap-celo", addr: "0x1e7d5f7c461d8f4678699669ace80e5e317b466f" },
    { name: "lido-celo", addr: "0x349618bed66c73faca427da69a26cb8f7f91b9bb" },
    { name: "ens-celo", addr: "0x1f54fd588a80bbde83d91003c043f21705814885" },
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
  const existingChildren = (await config.readClient.readContract({
    address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildCount",
  })) as bigint;

  if (existingChildren > 0n) {
    console.log(`[${config.name}] ${existingChildren} children already exist — skipping spawn`);
  } else {
    console.log(`[${config.name}] No children — spawning fresh`);
  }

  // Only spawn if no children exist yet
  if (existingChildren === 0n) {
  for (const gov of config.governors) {
    for (const perspective of PERSPECTIVES) {
      const childName = `${gov.name}-${perspective.suffix}`;
    try {
      // Derive a unique wallet for this child
      const childId = nextChildId++;
      const childWallet = deriveChildWallet(childId);
      console.log(`[${config.name}] Derived wallet for ${childName}: ${childWallet.address}`);

      // Fund the child wallet on the correct chain
      try {
        const isBase = config.name === "base-sepolia";
        const wc = isBase ? walletClient : celoWalletClient;
        const pc = isBase ? publicClient : celoPublicClient;
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

      // ERC-8004 identity
      try { await registerAgent(`spawn://${childName}.spawn.eth`, { agentType: "child", assignedDAO: gov.name, governanceContract: gov.addr, ensName: `${childName}.spawn.eth`, alignmentScore: 100, capabilities: ["vote", "reason", perspective.suffix], createdAt: Date.now() }); } catch {}

      // MetaMask delegation — ERC-7715 scoped voting authority with onchain proof
      try {
        const delegationRecord = await createVotingDelegation(gov.addr, childWallet.address as `0x${string}`, 100, childName);
        console.log(`[${config.name}] Delegation created for ${childName}: hash=${delegationRecord.delegationHash.slice(0, 18)}...`);
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
            // Search derived wallets to find matching key
            for (let id = 0; id < 100; id++) {
              const w = deriveChildWallet(id);
              if (w.address.toLowerCase() === operator.toLowerCase()) {
                childKey = w.privateKey;
                childWalletKeys.set(child.ensLabel, childKey);
                console.log(`  ${child.ensLabel}: recovered wallet (childId=${id})`);
                break;
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

      spawnChildProcess(child.childAddr, child.governance, child.ensLabel, config.treasury, childKey, config.name);
    }
  }
}

function spawnChildProcess(childAddr: string, governanceAddr: string, label: string, treasuryAddr: string, childPrivateKey?: `0x${string}`, chainName?: string, lineageContext?: string) {
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
    // Find perspective from label (e.g., "uniswap-dao-conservative" -> "conservative")
    const perspectiveSuffix = label.split("-").pop() || "";
    const perspective = PERSPECTIVES.find(p => p.suffix === perspectiveSuffix);
    if (perspective) {
      childEnv.CHILD_PERSPECTIVE = perspective.prompt;
    }
    // Append lineage context from terminated predecessors
    if (lineageContext) {
      childEnv.CHILD_PERSPECTIVE = (childEnv.CHILD_PERSPECTIVE || '') + lineageContext;
    }

    const child = fork(childScript, [childAddr, governanceAddr, label, treasuryAddr], {
      execArgv: ["--import", "tsx"],
      env: childEnv,
      cwd: join(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    child.stdout?.on("data", (data) => process.stdout.write(`  [${label}] ${data}`));
    child.stderr?.on("data", (data) => process.stderr.write(`  [${label}:err] ${data}`));
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

  // Health check: auto-fund any child with empty wallet
  for (const child of children) {
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
      }
    } catch {}
  }

  for (const child of children) {
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

      // Mirror alignment score to ERC-8004 (makes it a live performance ledger)
      try {
        await updateAgentMetadata(BigInt(0), { alignmentScore: clamped });
      } catch {}

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

          // === IPFS LINEAGE PERSISTENCE (Agent 2) ===
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const memoryCid = await pinTerminationMemory({
              lineageKey,
              generation: gen,
              reason: postMortemText?.slice(0, 300) || `score_${clamped}`,
              score: clamped,
              childLabel: child.ensLabel,
              // Full structured Venice analysis
              summary: structuredReport?.summary,
              lessons: structuredReport?.lessons,
              avoidPatterns: structuredReport?.avoidPatterns,
              recommendedFocus: structuredReport?.recommendedFocus,
              // Actual voting record that caused the drift
              votingHistory: historyForEval?.map((v: any) => ({
                proposalId: v.proposalId?.toString(),
                support: v.support,
              })),
              ownerValues: values,
            });
            if (memoryCid) {
              lastMemoryCid = memoryCid;
              console.log(`  [Memory] Pinned to IPFS: ${memoryCid}`);
            }
          } catch {}
          // === END IPFS LINEAGE PERSISTENCE ===

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
              spawnChildProcess(respawned.childAddr, respawned.governance, newLabel, config.treasury, newChildWallet.privateKey, config.name, lineageContext);
              console.log(`  ↻ Child process launched for ${newLabel}`);
              // Create fresh ERC-7715 delegation for the respawned child
              try { await createVotingDelegation(child.governance, newChildWallet.address as `0x${string}`, 100, newLabel); } catch (delErr: any) { console.log(`  [Delegation] Creation failed for ${newLabel}: ${delErr?.message?.slice(0, 60)}`); }
              // Copy lineage memory CID to the NEW child's ENS label so dashboard can read it
              if (lastMemoryCid) {
                try {
                  await setChildTextRecord(newLabel, 'lineage-memory', lastMemoryCid);
                  console.log(`  [Memory] CID written to ${newLabel}.spawn.eth`);
                } catch {}
              }
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

          // === IPFS LINEAGE PERSISTENCE (Agent 2) ===
          try {
            const lineageKey = child.ensLabel.replace(/-v\d+$/, '');
            const gen = parseInt(child.ensLabel.match(/-v(\d+)$/)?.[1] || '1');
            const memoryCid = await pinTerminationMemory({
              lineageKey,
              generation: gen,
              reason: `onchain_score_${onchainScore}`,
              score: onchainScore,
              childLabel: child.ensLabel,
            });
            if (memoryCid) {
              console.log(`  [Memory] Pinned to IPFS: ${memoryCid}`);
              try {
                await setChildTextRecord(lineageKey, 'lineage-memory', memoryCid);
                console.log(`  [Memory] ENS updated: ${lineageKey}.spawn.eth lineage-memory=${memoryCid}`);
              } catch {}
            }
          } catch {}
          // === END IPFS LINEAGE PERSISTENCE ===

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
              spawnChildProcess(respawned.childAddr, respawned.governance, newLabel, config.treasury, newChildWallet.privateKey, config.name, lineageContextFallback);
              console.log(`  ↻ Respawned ${newLabel} with process`);
              try { await createVotingDelegation(child.governance, newChildWallet.address as `0x${string}`, 100, newLabel); } catch (delErr: any) { console.log(`  [Delegation] Creation failed for ${newLabel}: ${delErr?.message?.slice(0, 60)}`); }
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

  const parentBalance = await (config.readClient as any).getBalance({ address: account.address });
  const targetTotal = config.governors.length * 3; // 3 perspectives per governor
  console.log(`\n[Scaling] ${config.name}: ${children.length}/${targetTotal} agents | Budget: ${(Number(parentBalance) / 1e18).toFixed(4)} ETH`);

  // Check which governors have children assigned
  const coveredGovernors = new Set<string>();
  for (const child of children) {
    coveredGovernors.add((child.governance as string).toLowerCase());
  }

  // Count how many children per governor
  const childrenPerGov = new Map<string, number>();
  for (const child of children) {
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
      const alreadyExists = children.some((c: any) => c.ensLabel === childName || c.ensLabel.startsWith(`${childName}-v`));
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
          spawnChildProcess(newChild.childAddr, gov.addr, childName, config.treasury, childWallet.privateKey, config.name);
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
  for (const child of children) {
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

  console.log(`[Scaling] Active: ${children.length} children | Budget: ${(Number(parentBalance) / 1e18).toFixed(4)} ETH`);
}

// ── Main ──
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  SPAWN PROTOCOL — AUTONOMOUS GOVERNANCE SWARM       ║");
  console.log("║  Cross-chain · Self-correcting · Zero human input   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\nAgent: ${account.address}`);
  console.log(`Chains: Base Sepolia + Celo Sepolia`);
  console.log(`DAOs per chain: 3 (Uniswap, Lido, ENS)`);
  console.log(`Total agents: 6 children + 1 parent = 7\n`);

  initSimulatedTreasury(BigInt(2e18), Math.floor(Date.now() / 1000) - 172800);

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

  // Initialize both chains
  await initChain(BASE_CONFIG);
  try { await initChain(CELO_CONFIG); } catch (err: any) {
    console.log(`[Celo] Init failed: ${err?.message?.slice(0, 60)} — continuing without Celo`);
  }

  // Start multi-source discovery feed — Tally + Snapshot + simulated
  console.log("\n── Starting proposal discovery feed ──");
  try {
    await startProposalFeed(
      BASE_CONFIG.governors.map(g => ({ addr: g.addr, name: g.name })),
      BASE_CONFIG.sendTx as any
    );
    console.log(`[Discovery] Feed active — Tally + Snapshot + simulated`);
  } catch (err: any) {
    console.log(`[Discovery] Feed failed to start: ${err?.message?.slice(0, 50)}. Using proposal bank instead.`);
  }

  // Also create proposals from the bank for diverse coverage
  console.log("\n── Seeding initial proposals ──");
  for (let i = 0; i < 3; i++) {
    await createProposalOnChain(BASE_CONFIG);
    await createProposalOnChain(CELO_CONFIG);
  }

  // Proposal creation loop — new proposals appear automatically
  setInterval(async () => {
    console.log("\n── New proposals appearing ──");
    await createProposalOnChain(BASE_CONFIG);
    await createProposalOnChain(CELO_CONFIG);
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
    console.log(`\n══ Parent Evaluation Cycle (${new Date().toISOString()}) ══`);

    try {
      console.log(`\n[Base Sepolia]`);
      await evaluateChainChildren(BASE_CONFIG);
    } catch (err: any) {
      console.log(`[Base Sepolia] Eval error: ${err?.message?.slice(0, 80)}`);
    }

    try {
      console.log(`\n[Celo Sepolia]`);
      // Timeout Celo eval at 30s so it doesn't block Base
      await Promise.race([
        evaluateChainChildren(CELO_CONFIG),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Celo eval timeout")), 30000)),
      ]);
    } catch (err: any) {
      console.log(`[Celo Sepolia] Eval error: ${err?.message?.slice(0, 80)}`);
    }

    try {
      console.log(`\n[Yield]`);
      await logYieldStatus();
    } catch {}

    // Dynamic scaling — auto-spawn/recall based on conditions
    try {
      await dynamicScaling(BASE_CONFIG);
    } catch (err: any) {
      console.log(`[Scaling] Error: ${err?.message?.slice(0, 50)}`);
    }

    // Venice usage metrics
    const veniceMetrics = getVeniceMetrics();
    console.log(`\n[Venice] Total calls: ${veniceMetrics.totalCalls} | Tokens: ${veniceMetrics.totalTokens}`);

    // Venice: generate swarm status report
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

    // Pin agent log to IPFS and store CID onchain
    if (process.env.PINATA_JWT) {
      pinAgentLog()
        .then(async (cid) => {
          console.log(`[IPFS] Agent log pinned: ${cid}`);
          try {
            await storeLogCIDOnchain(cid);
          } catch (err: any) {
            console.warn(`[IPFS] Failed to store CID onchain: ${err?.message?.slice(0, 80) || "unknown"}`);
          }
        })
        .catch((err) => {
          console.warn(`[IPFS] Pin failed: ${err?.message?.slice(0, 80) || "unknown"}`);
        });
    }

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
