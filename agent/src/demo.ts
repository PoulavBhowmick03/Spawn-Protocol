/**
 * Demo script — runs the full Spawn Protocol lifecycle on Base Sepolia.
 *
 * Usage: npm run demo
 *
 * Requires: PRIVATE_KEY and VENICE_API_KEY set in ../.env
 */

import { publicClient, account, sendTxAndWait } from "./chain.js";
import {
  MockGovernorABI,
  ParentTreasuryABI,
  SpawnFactoryABI,
  ChildGovernorABI,
} from "./abis.js";
import { reasonAboutProposal, evaluateAlignment } from "./venice.js";
import { registerAgent } from "./identity.js";
import { registerSubdomain } from "./ens.js";
import { createVotingDelegation } from "./delegation.js";
import { initSimulatedTreasury, logYieldStatus } from "./lido.js";
import { toHex } from "viem";
import type { DeployedAddresses } from "./types.js";

// ========= Base Sepolia Deployed Addresses =========
const ADDRESSES: DeployedAddresses = {
  mockGovernor: "0xabCBCa03e9E604Bb5182871aFc6EAeE8Da54Ef6b",
  parentTreasury: "0xf8C1B9f2093AbA98758Ab9fdDECA4a51679eA51F",
  childImplementation: "0xce1847216305F4e8029af2587b7EccbdfF6D2527",
  spawnFactory: "0x7890836c5C8F1E0fa73045791C42C746A3826163",
  timeLock: "0x05952Db4Eece0EE3498fbcf25E8e29133AcAdE09",
};

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     SPAWN PROTOCOL — LIVE DEMO           ║");
  console.log("║     Autonomous DAO Governance Swarm       ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Agent wallet:", account.address);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", (Number(balance) / 1e18).toFixed(6), "ETH\n");

  // ── Step 0: Register parent agent ──
  console.log("── Step 0: Registering parent agent ──");
  const currentAgent = (await publicClient.readContract({
    address: ADDRESSES.parentTreasury,
    abi: ParentTreasuryABI,
    functionName: "parentAgent",
  })) as `0x${string}`;

  if (currentAgent.toLowerCase() !== account.address.toLowerCase()) {
    await sendTxAndWait({
      address: ADDRESSES.parentTreasury,
      abi: ParentTreasuryABI,
      functionName: "setParentAgent",
      args: [account.address],
    });
    console.log("Parent agent registered:", account.address);
  } else {
    console.log("Parent agent already registered");
  }

  // Register parent ERC-8004 identity
  try {
    await registerAgent("spawn://parent.spawn.eth", {
      agentType: "parent", assignedDAO: "all",
      governanceContract: ADDRESSES.mockGovernor,
      ensName: "parent.spawn.eth", alignmentScore: 100,
      capabilities: ["spawn", "evaluate", "terminate", "fund"],
      createdAt: Date.now(),
    });
    console.log("ERC-8004 parent identity registered");
  } catch {}

  // Simulated Lido treasury
  initSimulatedTreasury(BigInt(1e18), Math.floor(Date.now() / 1000) - 86400);
  console.log();

  // ── Step 1: Read governance values ──
  console.log("── Step 1: Reading owner governance values ──");
  const values = (await publicClient.readContract({
    address: ADDRESSES.parentTreasury,
    abi: ParentTreasuryABI,
    functionName: "getGovernanceValues",
  })) as string;
  console.log("Values:", values, "\n");

  // ── Step 2: Fund factory ──
  console.log("── Step 2: Funding SpawnFactory ──");
  try {
    const factoryBalance = await publicClient.getBalance({ address: ADDRESSES.spawnFactory });
    if (factoryBalance < BigInt(1e16)) {
      await sendTxAndWait({
        address: ADDRESSES.parentTreasury,
        abi: ParentTreasuryABI,
        functionName: "deposit",
        args: [],
        value: BigInt(5e16),
      });
      await sendTxAndWait({
        address: ADDRESSES.parentTreasury,
        abi: ParentTreasuryABI,
        functionName: "fundFactory",
        args: [BigInt(5e16)],
      });
      console.log("Factory funded with 0.05 ETH");
    } else {
      console.log("Factory already funded:", (Number(factoryBalance) / 1e18).toFixed(6), "ETH");
    }
  } catch (err) {
    console.warn("Factory funding issue (non-fatal, children spawn with 0 budget):", (err as Error).message?.slice(0, 80));
  }
  console.log();

  // ── Step 3: Spawn 3 child agents ──
  console.log("── Step 3: Spawning 3 child governance agents ──");
  const childNames = ["uniswap-gov", "lido-gov", "ens-gov"];

  for (const name of childNames) {
    const receipt = await sendTxAndWait({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "spawnChild",
      args: [name, ADDRESSES.mockGovernor, 0n, 200000n],
    });
    console.log(`  Spawned ${name} (tx: ${receipt.transactionHash})`);
  }

  const children = (await publicClient.readContract({
    address: ADDRESSES.spawnFactory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as any[];

  for (const child of children) {
    console.log(`  Child ${child.id}: ${child.ensLabel} @ ${child.childAddr}`);
    try {
      await registerSubdomain(child.ensLabel, child.childAddr);
      await registerAgent(`spawn://${child.ensLabel}.spawn.eth`, {
        agentType: "child", assignedDAO: child.ensLabel,
        governanceContract: ADDRESSES.mockGovernor,
        ensName: `${child.ensLabel}.spawn.eth`, alignmentScore: 100,
        capabilities: ["vote", "reason", "encrypt-rationale"],
        createdAt: Date.now(),
      });
      await createVotingDelegation(ADDRESSES.mockGovernor, child.childAddr, 100);
    } catch {}
  }
  console.log();

  // ── Step 4: Create governance proposals ──
  console.log("── Step 4: Creating governance proposals ──");
  const proposals = [
    "Allocate 500K USDC from treasury to fund public goods grants program",
    "Reduce token emission rate by 30% to combat inflation",
    "Establish a security council with 5 multisig members for emergency actions",
  ];

  for (const desc of proposals) {
    await sendTxAndWait({
      address: ADDRESSES.mockGovernor,
      abi: MockGovernorABI,
      functionName: "createProposal",
      args: [desc],
    });
    console.log(`  Created: "${desc.slice(0, 60)}..."`);
  }
  console.log();

  // ── Step 5: Children vote via Venice AI ──
  console.log("── Step 5: Children voting via Venice AI (llama-3.3-70b) ──");
  const proposalCount = (await publicClient.readContract({
    address: ADDRESSES.mockGovernor,
    abi: MockGovernorABI,
    functionName: "proposalCount",
  })) as bigint;

  for (const child of children) {
    for (let p = 1n; p <= proposalCount; p++) {
      const proposal = (await publicClient.readContract({
        address: ADDRESSES.mockGovernor,
        abi: MockGovernorABI,
        functionName: "getProposal",
        args: [p],
      })) as any;

      const systemPrompt = `You are autonomous governance agent "${child.ensLabel}". Vote decisively per owner values. Be concise.`;

      console.log(`  ${child.ensLabel} reasoning about proposal ${p}...`);
      const { decision, reasoning } = await reasonAboutProposal(
        proposal.description,
        values,
        systemPrompt
      );

      const support = decision === "FOR" ? 1 : decision === "AGAINST" ? 0 : 2;
      const encryptedRationale = toHex(reasoning);

      const receipt = await sendTxAndWait({
        address: child.childAddr,
        abi: ChildGovernorABI,
        functionName: "castVote",
        args: [p, support, encryptedRationale],
      });
      console.log(`  >> ${child.ensLabel} voted ${decision} on proposal ${p} (tx: ${receipt.transactionHash.slice(0, 18)}...)`);
      console.log(`     Reasoning: ${reasoning.slice(0, 100)}...`);
    }
    console.log();
  }

  // ── Step 6: Parent evaluates alignment ──
  console.log("── Step 6: Parent evaluating child alignment via Venice ──");
  for (const child of children) {
    const history = (await publicClient.readContract({
      address: child.childAddr,
      abi: ChildGovernorABI,
      functionName: "getVotingHistory",
    })) as any[];

    const historyForEval = history.map((v: any) => ({
      proposalId: v.proposalId.toString(),
      support: Number(v.support),
    }));

    const score = await evaluateAlignment(values, historyForEval);
    const clamped = Math.min(Math.max(score, 0), 100);
    const label = clamped >= 70 ? "ALIGNED" : clamped >= 40 ? "DRIFTING" : "MISALIGNED";
    console.log(`  ${child.ensLabel}: ${clamped}/100 [${label}]`);

    await sendTxAndWait({
      address: child.childAddr,
      abi: ChildGovernorABI,
      functionName: "updateAlignmentScore",
      args: [BigInt(clamped)],
    });
  }
  console.log();

  // ── Step 7: Terminate misaligned child + respawn ──
  console.log("── Step 7: Simulating misalignment — terminate + respawn ──");
  if (children.length >= 3) {
    const target = children[2]; // last child
    console.log(`  Marking ${target.ensLabel} as misaligned (score 15)...`);
    await sendTxAndWait({
      address: target.childAddr,
      abi: ChildGovernorABI,
      functionName: "updateAlignmentScore",
      args: [15n],
    });

    console.log(`  TERMINATING ${target.ensLabel} (recallChild)...`);
    await sendTxAndWait({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "recallChild",
      args: [target.id],
    });

    const newLabel = `${target.ensLabel}-v2`;
    console.log(`  RESPAWNING replacement: ${newLabel}...`);
    await sendTxAndWait({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "spawnChild",
      args: [newLabel, ADDRESSES.mockGovernor, 0n, 200000n],
    });

    const updatedChildren = (await publicClient.readContract({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "getActiveChildren",
    })) as any[];
    console.log(`  Active children after respawn: ${updatedChildren.length}`);
    for (const c of updatedChildren) {
      console.log(`    ${c.id}: ${c.ensLabel} @ ${c.childAddr} (active: ${c.active})`);
    }
  }
  console.log();

  // ── Step 8: Yield status ──
  console.log("── Step 8: Treasury yield status (Lido stETH) ──");
  await logYieldStatus();
  console.log();

  // ── Summary ──
  console.log("╔══════════════════════════════════════════╗");
  console.log("║          DEMO COMPLETE                    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`Children spawned: ${children.length}`);
  console.log(`Proposals created: ${proposalCount.toString()}`);
  console.log(`Total votes cast: ${children.length * Number(proposalCount)}`);
  console.log(`Reasoning: Venice AI (llama-3.3-70b, private, no data retention)`);
  console.log(`All votes: onchain on Base Sepolia`);
  console.log(`Explorer: https://sepolia.basescan.org/address/${ADDRESSES.spawnFactory}`);
}

main().catch(console.error);
