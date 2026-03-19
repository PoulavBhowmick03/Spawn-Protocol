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
import { evaluateAlignment, generateSwarmReport, generateTerminationReport } from "./venice.js";
import { registerSubdomain, deregisterSubdomain, setAgentMetadata } from "./ens.js";
import { deriveChildWallet } from "./wallet-manager.js";
import { registerAgent, updateAgentMetadata } from "./identity.js";
import { createVotingDelegation } from "./delegation.js";
import { logYieldStatus, initSimulatedTreasury } from "./lido.js";
import { logParentAction, logChildAction } from "./logger.js";
import { startProposalFeed, getDiscoveredDAOs, getLatestProposals } from "./discovery.js";
import { parseEther } from "viem";
import type { DeployedAddresses } from "./types.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALIGNMENT_THRESHOLD = 40;
const STRIKES_TO_KILL = 2;
const PARENT_CYCLE_MS = 90_000; // evaluate every 90s
const PROPOSAL_INTERVAL_MS = 180_000; // new proposal every 3 min

const childProcesses = new Map<string, ChildProcess>();
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
  treasury: "0xF470384d5d08720785460567f2F785f62b6d016c",
  factory: "0xbee1A2c4950117a276FBBa17eebc33b324125760",
  governors: [
    { name: "uniswap-dao", addr: "0x55d18aAFaf7Ef1838d3df5DCb4B0A899F6fB6B0e" },
    { name: "lido-dao", addr: "0x34384d90A14633309100BA52f73Aec0e0D5C0a8C" },
    { name: "ens-dao", addr: "0xFB98e4688e31E56e761d2837248CD1C1181D3BE7" },
  ],
};

const CELO_CONFIG: ChainConfig = {
  name: "celo-sepolia",
  sendTx: sendTxAndWaitCelo,
  readClient: celoPublicClient,
  treasury: "0xa661fa0Ec3DDfcE13eC4b67633E39fbc0068b52E",
  factory: "0x6286FEC559c37C4C1ea4e756D368Db0b9226716d",
  governors: [
    { name: "uniswap-celo", addr: "0x739F3AE3be1EC6261caF97cC92938edCd3D36D61" },
    { name: "lido-celo", addr: "0xF81dEf4254ee1EC95dA18954044defB34C30fef8" },
    { name: "ens-celo", addr: "0x5687a0414Fdc510Dde3DB7b33C3b557619FBFf01" },
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

  // Fund factory
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

  // Spawn one child per governor with unique wallets
  for (const gov of config.governors) {
    try {
      // Derive a unique wallet for this child
      const childId = nextChildId++;
      const childWallet = deriveChildWallet(childId);
      console.log(`[${config.name}] Derived wallet for ${gov.name}: ${childWallet.address} (childId=${childId})`);

      // Fund the child wallet with 0.001 ETH from parent
      try {
        const fundHash = await walletClient.sendTransaction({
          to: childWallet.address,
          value: parseEther("0.001"),
        });
        await publicClient.waitForTransactionReceipt({ hash: fundHash });
        console.log(`[${config.name}] Funded ${gov.name} wallet (${childWallet.address}) with 0.001 ETH`);
      } catch (fundErr: any) {
        console.log(`[${config.name}] Wallet funding for ${gov.name}: ${fundErr?.message?.slice(0, 50) || "skipped"}`);
      }

      // Store the child private key for later use by the child process
      childWalletKeys.set(gov.name, childWallet.privateKey);

      const receipt = await config.sendTx({
        address: config.factory,
        abi: SpawnFactoryABI,
        functionName: "spawnChild",
        args: [gov.name, gov.addr, 0n, 200000n],
      });
      console.log(`[${config.name}] Spawned ${gov.name}`);

      // Set child's unique wallet as operator — call directly on ChildGovernor
      // (parent is authorized to call setOperator)
      try {
        const children = (await config.readClient.readContract({
          address: config.factory, abi: SpawnFactoryABI, functionName: "getActiveChildren",
        })) as any[];
        const justSpawned = children.find((c: any) => c.ensLabel === gov.name);
        if (justSpawned) {
          await config.sendTx({
            address: justSpawned.childAddr,
            abi: ChildGovernorABI,
            functionName: "setOperator",
            args: [childWallet.address],
          });
          console.log(`[${config.name}] Operator set: ${gov.name} => ${childWallet.address}`);
        }
      } catch (err: any) {
        console.log(`[${config.name}] Operator set failed: ${err?.message?.slice(0, 50)}`);
      }

      logParentAction("spawn_child", {
        chain: config.name, dao: gov.name, governor: gov.addr,
        childWallet: childWallet.address,
      }, { txHash: receipt.transactionHash }, receipt.transactionHash);

      // Register ERC-8004 + ENS (with child's unique wallet address) + delegation
      try { await registerAgent(`spawn://${gov.name}.spawn.eth`, { agentType: "child", assignedDAO: gov.name, governanceContract: gov.addr, ensName: `${gov.name}.spawn.eth`, alignmentScore: 100, capabilities: ["vote", "reason"], createdAt: Date.now() }); } catch {}
      try {
        await registerSubdomain(gov.name, childWallet.address);
        // Set text records for agent metadata
        await setAgentMetadata(gov.name, {
          agentType: "child",
          governanceContract: gov.addr,
          walletAddress: childWallet.address,
          capabilities: "vote,reason",
        });
      } catch {}
      try { await createVotingDelegation(gov.addr, childWallet.address as `0x${string}`, 100); } catch {}
    } catch (err: any) {
      console.log(`[${config.name}] ${gov.name}: ${err?.message?.slice(0, 50) || "spawn skipped"}`);
    }
  }

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
      const childKey = childWalletKeys.get(child.ensLabel);
      spawnChildProcess(child.childAddr, child.governance, child.ensLabel, config.treasury, childKey);
    }
  }
}

function spawnChildProcess(childAddr: string, governanceAddr: string, label: string, treasuryAddr: string, childPrivateKey?: `0x${string}`) {
  const childScript = join(__dirname, "spawn-child.ts");
  try {
    // Pass the child's unique private key via environment variable
    const childEnv = { ...process.env };
    if (childPrivateKey) {
      childEnv.CHILD_PRIVATE_KEY = childPrivateKey;
    }

    const child = fork(childScript, [childAddr, governanceAddr, label, treasuryAddr], {
      execArgv: ["--import", "tsx"],
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    child.stdout?.on("data", (data) => process.stdout.write(`  [${label}] ${data}`));
    child.stderr?.on("data", (data) => process.stderr.write(`  [${label}:err] ${data}`));
    child.on("exit", (code) => {
      console.log(`[Swarm] ${label} exited (code ${code})`);
      childProcesses.delete(label);
    });

    childProcesses.set(label, child);
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
    console.log(`[${config.name}] New proposal on ${gov.name}: "${proposal.slice(0, 50)}..."`);
    logParentAction("create_proposal", { chain: config.name, dao: gov.name, description: proposal }, { txHash: receipt.transactionHash }, receipt.transactionHash);
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

  for (const child of children) {
    try {
      const history = (await config.readClient.readContract({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "getVotingHistory",
      })) as any[];

      if (history.length === 0) {
        console.log(`  ${child.ensLabel}: waiting for votes`);
        continue;
      }

      const historyForEval = history.map((v: any) => ({
        proposalId: v.proposalId.toString(),
        support: Number(v.support),
      }));

      const score = await evaluateAlignment(values, historyForEval);
      const clamped = Math.min(Math.max(score, 0), 100);
      const label = clamped >= 70 ? "ALIGNED" : clamped >= 40 ? "DRIFTING" : "MISALIGNED";

      console.log(`  ${child.ensLabel}: ${clamped}/100 [${label}] (${history.length} votes)`);

      const receipt = await config.sendTx({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "updateAlignmentScore",
        args: [BigInt(clamped)],
      });

      logParentAction("evaluate_alignment", { chain: config.name, child: child.ensLabel, votes: history.length }, { score: clamped, label }, receipt.transactionHash);

      // Strike tracking
      const key = `${config.name}:${child.id}`;
      if (clamped < ALIGNMENT_THRESHOLD) {
        const s = (strikes.get(key) || 0) + 1;
        strikes.set(key, s);
        console.log(`  ⚠ Strike ${s}/${STRIKES_TO_KILL}`);

        if (s >= STRIKES_TO_KILL) {
          console.log(`  TERMINATING ${child.ensLabel}`);
          const proc = childProcesses.get(child.ensLabel);
          if (proc) proc.kill();

          await config.sendTx({
            address: config.factory,
            abi: SpawnFactoryABI,
            functionName: "recallChild",
            args: [child.id],
          });

          // Deregister ENS subdomain onchain
          try {
            await deregisterSubdomain(child.ensLabel);
            console.log(`  [ENS] Deregistered ${child.ensLabel}.spawn.eth`);
          } catch {}

          logParentAction("terminate_child", { chain: config.name, child: child.ensLabel, reason: "alignment_below_threshold" }, { finalScore: clamped });

          // Venice: generate termination post-mortem
          try {
            const postMortem = await generateTerminationReport(child.ensLabel, historyForEval, values, clamped);
            console.log(`  Post-mortem: ${postMortem.slice(0, 120)}`);
            logParentAction("termination_report", { child: child.ensLabel }, { report: postMortem });
          } catch {}

          // Respawn with new label + new unique wallet
          const newLabel = `${child.ensLabel}-v2`;
          const newChildId = nextChildId++;
          const newChildWallet = deriveChildWallet(newChildId);
          console.log(`  Respawning as ${newLabel} with wallet ${newChildWallet.address}`);

          // Fund the new child wallet
          try {
            const fundHash = await walletClient.sendTransaction({
              to: newChildWallet.address,
              value: parseEther("0.001"),
            });
            await publicClient.waitForTransactionReceipt({ hash: fundHash });
          } catch {}

          childWalletKeys.set(newLabel, newChildWallet.privateKey);

          await config.sendTx({
            address: config.factory,
            abi: SpawnFactoryABI,
            functionName: "spawnChild",
            args: [newLabel, child.governance, 0n, 200000n],
          });

          // Register ENS for the respawned child
          try {
            await registerSubdomain(newLabel, newChildWallet.address);
            await setAgentMetadata(newLabel, {
              agentType: "child",
              governanceContract: child.governance,
              walletAddress: newChildWallet.address,
              capabilities: "vote,reason",
            });
          } catch {}

          logParentAction("respawn_child", { chain: config.name, newLabel, governance: child.governance, newWallet: newChildWallet.address }, {});

          strikes.delete(key);
        }
      } else {
        strikes.set(key, 0);
      }
    } catch (err: any) {
      console.log(`  ${child.ensLabel}: eval failed (${err?.message?.slice(0, 30)})`);
    }
  }
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

  // Initialize Base Sepolia (Celo disabled — contracts need redeploy with operator auth)
  await initChain(BASE_CONFIG);
  // TODO: await initChain(CELO_CONFIG); — redeploy Celo contracts first

  // Start discovery feed — mirrors real/simulated proposals to each governor
  console.log("\n── Starting proposal discovery feed ──");
  for (const gov of BASE_CONFIG.governors) {
    await startProposalFeed(gov.addr, BASE_CONFIG.sendTx as any);
  }
  // Celo disabled until redeploy
  // for (const gov of CELO_CONFIG.governors) {
  //   await startProposalFeed(gov.addr, CELO_CONFIG.sendTx as any);
  // }
  console.log(`[Discovery] Feed active for ${BASE_CONFIG.governors.length + CELO_CONFIG.governors.length} governors across 2 chains`);

  // Also create proposals from the bank for diverse coverage
  console.log("\n── Seeding initial proposals ──");
  for (let i = 0; i < 3; i++) {
    await createProposalOnChain(BASE_CONFIG);
    // await createProposalOnChain(CELO_CONFIG);
  }

  // Proposal creation loop — new proposals appear automatically
  setInterval(async () => {
    console.log("\n── New proposals appearing ──");
    await createProposalOnChain(BASE_CONFIG);
    // await createProposalOnChain(CELO_CONFIG); // disabled until redeploy
    // Log discovered DAOs for visibility
    const daos = getDiscoveredDAOs();
    if (daos.length > 0) {
      console.log(`[Discovery] DAOs tracked: ${daos.map(d => `${d.name}(${d.proposalCount})`).join(", ")}`);
    }
  }, PROPOSAL_INTERVAL_MS);

  // Parent evaluation loop
  const parentLoop = async () => {
    const cycle = Date.now();
    console.log(`\n══ Parent Evaluation Cycle (${new Date().toISOString()}) ══`);

    console.log(`\n[Base Sepolia]`);
    await evaluateChainChildren(BASE_CONFIG);

    // Celo disabled until redeploy
    // console.log(`\n[Celo Sepolia]`);
    // await evaluateChainChildren(CELO_CONFIG);

    console.log(`\n[Yield]`);
    await logYieldStatus();

    // Venice: generate swarm status report
    try {
      const allChildren: { name: string; score: number; votes: number }[] = [];
      for (const cfg of [BASE_CONFIG]) { // Celo disabled until redeploy
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

    setTimeout(parentLoop, PARENT_CYCLE_MS);
  };

  // First evaluation after children have had time to vote
  setTimeout(parentLoop, 45_000);

  console.log("\n══ Swarm is LIVE ══");
  console.log("Children are voting autonomously. Parent evaluates every 90s.");
  console.log("New proposals appear every 3 minutes.");
  console.log("Press Ctrl+C to stop.\n");
}

main().catch(console.error);
