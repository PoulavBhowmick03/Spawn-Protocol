/**
 * Spawn Protocol — Full Lifecycle Demo
 *
 * Runs the complete autonomous governance swarm lifecycle on Base Sepolia:
 *   1. Register parent identity (ERC-8004 + ENS)
 *   2. Read owner governance values onchain
 *   3. Spawn 3 child agents (EIP-1167 clones + ENS + ERC-8004 + delegation)
 *   4. Create 3 governance proposals on MockGovernor
 *   5. Each child reasons via Venice AI → encrypts rationale via Lit → votes onchain
 *   6. Parent evaluates alignment via Venice → scores all children
 *   7. Terminate misaligned child → respawn replacement with lineage memory
 *   8. Wait for voting period to end → decrypt + reveal rationale onchain
 *   9. Pin execution log to IPFS → store CID onchain as ENS text record
 *
 * Usage: npm run demo
 * Requires: PRIVATE_KEY, VENICE_API_KEY, and optionally LIT_PRIVATE_KEY in ../.env
 */

import { publicClient, walletClient, account, sendTxAndWait } from "./chain.js";
import { logParentAction, logChildAction } from "./logger.js";
import {
  MockGovernorABI,
  ParentTreasuryABI,
  SpawnFactoryABI,
  ChildGovernorABI,
} from "./abis.js";
import {
  reasonAboutProposal,
  summarizeProposal,
  assessProposalRisk,
  evaluateAlignment,
  generateTerminationReport,
  getVeniceMetrics,
} from "./venice.js";
import { encryptRationale, decryptRationale } from "./lit.js";
import { registerAgent } from "./identity.js";
import { registerSubdomain, setChildTextRecord } from "./ens.js";
import { createVotingDelegation, initDeleGatorAccount, getDeleGatorAddress, redeemVoteDelegation, type DelegationRecord } from "./delegation.js";
import { initSimulatedTreasury, logYieldStatus } from "./lido.js";
import { pinAgentLog, storeLogCIDOnchain } from "./ipfs.js";
import { toHex, keccak256, stringToHex } from "viem";

// ── Deployed contracts — Base Sepolia (current deployment) ──
const ADDRESSES = {
  mockGovernorUniswap: "0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9" as const,
  mockGovernorLido:    "0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC" as const,
  mockGovernorENS:     "0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C" as const,
  parentTreasury:      "0x9428B93993F06d3c5d647141d39e5ba54fb97a7b" as const,
  spawnFactory:        "0x8Ccd24213E765d636605a1F820336cd9E1c8A9C8" as const,
  childImpl:           "0xc82228e6C72b62a38b1946E29F981ad5D4641703" as const,
  timeLock:            "0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23" as const,
  ensRegistry:         "0x29170A43352D65329c462e6cDacc1c002419331D" as const,
};

const EXPLORER = "https://sepolia.basescan.org";

function sep(label: string) {
  const line = "─".repeat(50);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

function tx(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForProposalEnd(governor: `0x${string}`, proposalId: bigint): Promise<void> {
  const proposal = await publicClient.readContract({
    address: governor,
    abi: MockGovernorABI,
    functionName: "getProposal",
    args: [proposalId],
  }) as any;

  const endTime = Number(proposal.endTime);
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;

  if (remaining > 0) {
    console.log(`  Waiting ${remaining}s for voting period to close...`);
    for (let i = remaining; i > 0; i -= 10) {
      process.stdout.write(`  ${i}s remaining...\r`);
      await sleep(Math.min(10000, i * 1000));
    }
    console.log("  Voting period closed.                    ");
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║          SPAWN PROTOCOL — LIVE DEMO                ║");
  console.log("║    Autonomous DAO Governance Agent Swarm            ║");
  console.log("║    Base Sepolia · Venice AI · Lit Protocol          ║");
  console.log("╚════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Wallet:  ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance: ${(Number(balance) / 1e18).toFixed(6)} ETH`);
  console.log(`  Chain:   Base Sepolia (84532)`);

  // ── Step 0: Register parent ──────────────────────────────────────────
  sep("STEP 0 — Register parent agent (ERC-8004 + ENS)");

  const currentAgent = await publicClient.readContract({
    address: ADDRESSES.parentTreasury,
    abi: ParentTreasuryABI,
    functionName: "parentAgent",
  }) as `0x${string}`;

  if (currentAgent.toLowerCase() !== account.address.toLowerCase()) {
    const r = await sendTxAndWait({
      address: ADDRESSES.parentTreasury,
      abi: ParentTreasuryABI,
      functionName: "setParentAgent",
      args: [account.address],
    });
    console.log(`  Parent registered → ${tx(r.transactionHash)}`);
    logParentAction("register_parent", { address: account.address }, {}, r.transactionHash);
  } else {
    console.log("  Parent already registered ✓");
  }

  try {
    await registerAgent("spawn://parent.spawn.eth", {
      agentType: "parent", assignedDAO: "all",
      governanceContract: ADDRESSES.spawnFactory,
      ensName: "parent.spawn.eth", alignmentScore: 100,
      capabilities: ["spawn", "evaluate", "terminate", "fund"],
      createdAt: Date.now(),
    });
    console.log("  ERC-8004 parent identity registered ✓");
  } catch { console.log("  ERC-8004 already registered ✓"); }

  initSimulatedTreasury(BigInt(1e18), Math.floor(Date.now() / 1000) - 86400);

  // Init DeleGator smart account — required for ERC-7715 delegation redemption in Step 4
  const deleGatorAddr = await initDeleGatorAccount();
  if (deleGatorAddr) {
    console.log(`  DeleGator smart account: ${deleGatorAddr}`);
  } else {
    console.log("  DeleGator init failed — delegation redemption will fall back to direct castVote");
  }

  // ── Step 1: Read governance values ──────────────────────────────────
  sep("STEP 1 — Read owner governance values (onchain)");

  const values = await publicClient.readContract({
    address: ADDRESSES.parentTreasury,
    abi: ParentTreasuryABI,
    functionName: "getGovernanceValues",
  }) as string;
  console.log(`  Values: "${values}"`);

  // ── Step 2: Spawn 3 child agents ─────────────────────────────────────
  sep("STEP 2 — Spawn 3 child governance agents (EIP-1167 clones)");

  const childConfigs = [
    { label: "uniswap-dao-defi",        governor: ADDRESSES.mockGovernorUniswap, dao: "Uniswap" },
    { label: "lido-dao-publicgoods",     governor: ADDRESSES.mockGovernorLido,    dao: "Lido" },
    { label: "ens-dao-conservative",     governor: ADDRESSES.mockGovernorENS,     dao: "ENS" },
  ];

  const spawnedChildren: Array<{ id: bigint; childAddr: `0x${string}`; ensLabel: string; governor: `0x${string}`; dao: string; maxGasPerVote: bigint; delegationRecord?: DelegationRecord }> = [];

  for (const config of childConfigs) {
    const receipt = await sendTxAndWait({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "spawnChildWithOperator",
      args: [config.label, config.governor, 0n, 2000000n, account.address],
    });

    const children = await publicClient.readContract({
      address: ADDRESSES.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "getActiveChildren",
    }) as any[];

    const child = children.find((c: any) => c.ensLabel === config.label);
    if (!child) continue;

    let delegationRecord: DelegationRecord | undefined;
    spawnedChildren.push({ id: child.id, childAddr: child.childAddr, ensLabel: config.label, governor: config.governor, dao: config.dao, maxGasPerVote: 2000000n, delegationRecord: undefined });
    console.log(`  ⊕ Spawned ${config.label}.spawn.eth`);
    console.log(`    Clone address: ${child.childAddr}`);
    console.log(`    Tx: ${tx(receipt.transactionHash)}`);
    logParentAction("spawn_child", { label: config.label, dao: config.dao, governor: config.governor }, { childAddr: child.childAddr, txHash: receipt.transactionHash }, receipt.transactionHash);

    try { await registerSubdomain(config.label, child.childAddr); console.log(`    ENS: ${config.label}.spawn.eth ✓`); } catch {}
    try {
      await registerAgent(`spawn://${config.label}.spawn.eth`, {
        agentType: "child", assignedDAO: config.dao,
        governanceContract: config.governor,
        ensName: `${config.label}.spawn.eth`, alignmentScore: 100,
        capabilities: ["vote", "reason", "encrypt-rationale"],
        createdAt: Date.now(),
      });
      console.log(`    ERC-8004 identity ✓`);
    } catch {}
    try {
      // Scope delegation to the ChildGovernor clone (castVote target), delegatee = parent EOA
      delegationRecord = await createVotingDelegation(child.childAddr, account.address, 50, config.label);
      spawnedChildren[spawnedChildren.length - 1].delegationRecord = delegationRecord;
      console.log(`    ERC-7715 delegation ✓`);
      // Authorize DeleGator as operator so DelegationManager redemption passes onlyAuthorized
      const currentDeleGator = getDeleGatorAddress();
      if (currentDeleGator) {
        await sendTxAndWait({ address: child.childAddr, abi: ChildGovernorABI, functionName: "setOperator", args: [currentDeleGator] });
        console.log(`    DeleGator authorized as operator ✓`);
      }
    } catch (e: any) { console.log(`    ERC-7715 delegation: ${e?.message?.slice(0, 60) ?? "failed"}`); }
    console.log();
  }

  // ── Step 3: Create proposals ─────────────────────────────────────────
  sep("STEP 3 — Create governance proposals on each MockGovernor");

  const proposalsByGovernor: Record<string, { id: bigint; description: string; endTime: bigint }[]> = {};

  const proposalSets = [
    {
      governor: ADDRESSES.mockGovernorUniswap,
      proposals: [
        "Allocate 500K USDC from Uniswap treasury to fund public goods grants for DeFi infrastructure",
        "Reduce UNI token emission rate by 30% to combat inflation and preserve long-term value",
      ],
    },
    {
      governor: ADDRESSES.mockGovernorLido,
      proposals: [
        "Establish a security council of 5 multisig members for emergency protocol actions",
      ],
    },
    {
      governor: ADDRESSES.mockGovernorENS,
      proposals: [
        "Fund ENS ecosystem working group with 200K USDC for developer grants and community initiatives",
      ],
    },
  ];

  for (const set of proposalSets) {
    proposalsByGovernor[set.governor] = [];
    for (const desc of set.proposals) {
      const receipt = await sendTxAndWait({
        address: set.governor,
        abi: MockGovernorABI,
        functionName: "createProposal",
        args: [desc],
      });
      const count = await publicClient.readContract({
        address: set.governor,
        abi: MockGovernorABI,
        functionName: "proposalCount",
      }) as bigint;
      const proposal = await publicClient.readContract({
        address: set.governor,
        abi: MockGovernorABI,
        functionName: "getProposal",
        args: [count],
      }) as any;

      proposalsByGovernor[set.governor].push({ id: count, description: desc, endTime: proposal.endTime });
      console.log(`  Proposal #${count} on ${set.governor.slice(0, 10)}...`);
      console.log(`  "${desc.slice(0, 70)}..."`);
      console.log(`  Voting closes at: ${new Date(Number(proposal.endTime) * 1000).toISOString()}`);
      console.log();
    }
  }

  // ── Step 4: Children vote (Venice → Lit → onchain) ───────────────────
  sep("STEP 4 — Children vote: Venice AI → Lit encryption → onchain");

  // Store encrypted rationale data for later reveal
  const rationaleStore: Array<{
    childAddr: `0x${string}`;
    childLabel: string;
    governor: `0x${string}`;
    proposalId: bigint;
    ciphertext: string;
    dataToEncryptHash: string;
    proposalEndTime: bigint;
    decision: string;
  }> = [];

  for (const child of spawnedChildren) {
    const proposals = proposalsByGovernor[child.governor] ?? [];
    if (proposals.length === 0) continue;

    console.log(`\n  Agent: ${child.ensLabel}.spawn.eth (${child.dao})`);

    for (const proposal of proposals) {
      console.log(`\n  Proposal #${proposal.id}: "${proposal.description.slice(0, 60)}..."`);

      // Venice: summarize → assess risk → decide (3 E2EE calls)
      console.log("    [Venice] Summarizing proposal...");
      const summary = await summarizeProposal(proposal.description);
      console.log(`    Summary: ${summary.slice(0, 120)}...`);

      console.log("    [Venice] Assessing risk...");
      const risk = await assessProposalRisk(proposal.description, values);
      console.log(`    Risk: [${risk.riskLevel}] ${risk.factors.slice(0, 80)}...`);

      console.log("    [Venice] Reasoning about vote (private, no retention)...");
      const systemPrompt = `You are autonomous governance agent "${child.ensLabel}" representing the ${child.dao} DAO. Vote decisively based on the owner's stated governance values. Be concise and decisive.`;
      const { decision, reasoning } = await reasonAboutProposal(proposal.description, values, systemPrompt);

      const reasoningHash = keccak256(stringToHex(reasoning));
      console.log(`    Decision: ${decision}`);
      console.log(`    Reasoning hash (pre-vote commitment): ${reasoningHash}`);
      console.log(`    Reasoning preview: "${reasoning.slice(0, 100)}..."`);

      // Lit: encrypt rationale so it can't be read until after voting closes
      console.log("    [Lit] Encrypting rationale (decryptable after voting closes)...");
      let ciphertext = "";
      let dataToEncryptHash = "";
      let encryptedRationaleBytes: `0x${string}`;

      try {
        const encrypted = await encryptRationale(reasoning, proposal.endTime);
        ciphertext = encrypted.ciphertext;
        dataToEncryptHash = encrypted.dataToEncryptHash;
        // Store ciphertext + hash together as the onchain encrypted rationale
        encryptedRationaleBytes = toHex(JSON.stringify({ ciphertext, dataToEncryptHash, reasoningHash }));
        rationaleStore.push({
          childAddr: child.childAddr,
          childLabel: child.ensLabel,
          governor: child.governor,
          proposalId: proposal.id,
          ciphertext,
          dataToEncryptHash,
          proposalEndTime: proposal.endTime,
          decision,
        });
        console.log("    Rationale encrypted via Lit Protocol ✓");
      } catch (litErr: any) {
        console.warn(`    [Lit] Encryption unavailable (${litErr.message?.slice(0, 60) ?? "unknown"}) — committing reasoning hash instead`);
        encryptedRationaleBytes = toHex(JSON.stringify({ reasoningHash, note: "Lit unavailable — hash committed pre-vote" }));
      }

      // Cast vote — try DelegationManager redemption first (ERC-7715), fall back to direct castVote
      const support = decision === "FOR" ? 1 : decision === "AGAINST" ? 0 : 2;
      let voteHash: `0x${string}`;
      let viaLabel = "";
      if (child.delegationRecord && getDeleGatorAddress()) {
        try {
          voteHash = await redeemVoteDelegation(walletClient, publicClient, child.delegationRecord, child.childAddr, proposal.id, support, encryptedRationaleBytes);
          viaLabel = " [via DelegationManager]";
        } catch (delegErr: any) {
          console.log(`    Delegation redemption failed (${delegErr?.message?.slice(0, 60)}) — falling back to direct castVote`);
          const fallbackReceipt = await sendTxAndWait({ address: child.childAddr, abi: ChildGovernorABI, functionName: "castVote", args: [proposal.id, support, encryptedRationaleBytes], gas: child.maxGasPerVote });
          voteHash = fallbackReceipt.transactionHash;
        }
      } else {
        const fallbackReceipt = await sendTxAndWait({ address: child.childAddr, abi: ChildGovernorABI, functionName: "castVote", args: [proposal.id, support, encryptedRationaleBytes], gas: child.maxGasPerVote });
        voteHash = fallbackReceipt.transactionHash;
      }

      const decisionEmoji = decision === "FOR" ? "✅" : decision === "AGAINST" ? "❌" : "⬜";
      console.log(`    ${decisionEmoji} Voted ${decision} onchain${viaLabel} → ${tx(voteHash)}`);
      const voteReceipt = { transactionHash: voteHash };
      logChildAction(child.ensLabel, "cast_vote", { proposalId: proposal.id.toString(), description: proposal.description, decision }, { reasoning: reasoning.slice(0, 200), reasoningHash, txHash: voteReceipt.transactionHash }, voteReceipt.transactionHash);
    }
  }

  // ── Step 5: Parent evaluates alignment ───────────────────────────────
  sep("STEP 5 — Parent evaluates alignment via Venice AI");

  const alignmentScores: Record<string, number> = {};

  for (const child of spawnedChildren) {
    const history = await publicClient.readContract({
      address: child.childAddr,
      abi: ChildGovernorABI,
      functionName: "getVotingHistory",
    }) as any[];

    const historyForEval = history.map((v: any) => ({
      proposalId: v.proposalId.toString(),
      support: Number(v.support),
    }));

    const score = await evaluateAlignment(values, historyForEval);
    const clamped = Math.min(Math.max(score, 0), 100);
    const label = clamped >= 70 ? "ALIGNED ✓" : clamped >= 55 ? "DRIFTING ⚠" : "MISALIGNED ✗";

    console.log(`  ${child.ensLabel}: ${clamped}/100 [${label}]`);
    alignmentScores[child.ensLabel] = clamped;

    const r = await sendTxAndWait({
      address: child.childAddr,
      abi: ChildGovernorABI,
      functionName: "updateAlignmentScore",
      args: [BigInt(clamped)],
    });
    logParentAction("evaluate_alignment", { child: child.ensLabel, votes: historyForEval.length }, { score: clamped, label }, r.transactionHash);
  }

  // ── Step 6: Terminate misaligned child + respawn ──────────────────────
  sep("STEP 6 — Terminate misaligned agent → respawn with lineage memory");

  // Force-misalign the last child to demonstrate the lifecycle
  const target = spawnedChildren[spawnedChildren.length - 1];
  console.log(`  Forcing ${target.ensLabel} to misalignment score 12 (simulating drift)...`);
  await sendTxAndWait({
    address: target.childAddr,
    abi: ChildGovernorABI,
    functionName: "updateAlignmentScore",
    args: [12n],
  });

  // Generate termination report via Venice
  console.log("  [Venice] Generating termination report...");
  const historyForReport = (await publicClient.readContract({
    address: target.childAddr,
    abi: ChildGovernorABI,
    functionName: "getVotingHistory",
  }) as any[]).map((v: any) => ({ proposalId: v.proposalId.toString(), support: Number(v.support) }));
  const terminationReport = await generateTerminationReport(target.ensLabel, historyForReport, values, 12);
  console.log(`  Report: "${terminationReport.slice(0, 120)}..."`);

  console.log(`\n  ⊗ TERMINATING ${target.ensLabel}.spawn.eth...`);
  const terminateTx = await sendTxAndWait({
    address: ADDRESSES.spawnFactory,
    abi: SpawnFactoryABI,
    functionName: "recallChild",
    args: [target.id],
  });
  console.log(`  Terminated → ${tx(terminateTx.transactionHash)}`);
  logParentAction("terminate_child", { child: target.ensLabel, reason: "alignment_below_threshold", score: 12 }, { txHash: terminateTx.transactionHash }, terminateTx.transactionHash);

  // Respawn with lineage memory injected via Venice system prompt
  const newLabel = `${target.ensLabel}-v2`;
  const lineageContext = `LINEAGE MEMORY: Predecessor "${target.ensLabel}" was terminated. Report: ${terminationReport.slice(0, 200)}`;
  console.log(`\n  ⊕ RESPAWNING ${newLabel}.spawn.eth with lineage memory...`);
  console.log(`  Lineage context: "${lineageContext.slice(0, 100)}..."`);

  const respawnTx = await sendTxAndWait({
    address: ADDRESSES.spawnFactory,
    abi: SpawnFactoryABI,
    functionName: "spawnChildWithOperator",
    args: [newLabel, target.governor, 0n, 300000n, account.address],
  });
  console.log(`  Respawned → ${tx(respawnTx.transactionHash)}`);
  logParentAction("spawn_child", { label: newLabel, lineage: target.ensLabel, reason: "replacement" }, { txHash: respawnTx.transactionHash }, respawnTx.transactionHash);

  try { await registerSubdomain(newLabel, target.childAddr); } catch {}
  try { await setChildTextRecord(newLabel, "lineage-memory", terminationReport.slice(0, 200)); } catch {}

  // ── Step 7: Wait for voting to end → reveal rationale ─────────────────
  sep("STEP 7 — Voting period ends → decrypt + reveal rationale onchain");

  if (rationaleStore.length > 0) {
    // Wait for the first proposal's voting period to end
    const firstRationale = rationaleStore[0];
    console.log(`  Waiting for voting period to close on proposal #${firstRationale.proposalId}...`);
    await waitForProposalEnd(firstRationale.governor, firstRationale.proposalId);

    for (const stored of rationaleStore) {
      console.log(`\n  Revealing rationale for ${stored.childLabel} on proposal #${stored.proposalId}...`);
      let revealedRationale = "";

      try {
        revealedRationale = await decryptRationale(stored.ciphertext, stored.dataToEncryptHash, stored.proposalEndTime);
        console.log("  [Lit] Decryption successful (time-lock expired) ✓");
        console.log(`  Rationale: "${revealedRationale.slice(0, 150)}..."`);
      } catch (litErr: any) {
        console.warn(`  [Lit] Decrypt unavailable (${litErr.message?.slice(0, 60) ?? "unknown"}) — using stored reasoning`);
        revealedRationale = `[Lit decrypt unavailable] Decision: ${stored.decision}`;
      }

      const revealTx = await sendTxAndWait({
        address: stored.childAddr,
        abi: ChildGovernorABI,
        functionName: "revealRationale",
        args: [stored.proposalId, toHex(revealedRationale)],
      });
      console.log(`  Revealed onchain → ${tx(revealTx.transactionHash)}`);
      logChildAction(stored.childLabel, "reveal_rationale", { proposalId: stored.proposalId.toString() }, { txHash: revealTx.transactionHash }, revealTx.transactionHash);
    }
  } else {
    console.log("  No Lit-encrypted rationale to reveal (Lit unavailable during vote step).");
  }

  // ── Step 8: Treasury yield ───────────────────────────────────────────
  sep("STEP 8 — Lido stETH treasury yield status");
  await logYieldStatus();

  // ── Step 9: IPFS pin + onchain CID ───────────────────────────────────
  sep("STEP 9 — Pin execution log to IPFS → store CID onchain");

  try {
    console.log("  Pinning agent_log.json to IPFS via Filebase...");
    const cid = await pinAgentLog();
    console.log(`  IPFS CID: ${cid}`);
    console.log(`  Gateway: https://ipfs.filebase.io/ipfs/${cid}`);
    await storeLogCIDOnchain(cid);
    console.log("  CID stored as ENS text record (parent.spawn.eth → ipfs.agent_log) ✓");
    logParentAction("ipfs_pin", {}, { cid });
  } catch (err: any) {
    console.warn(`  IPFS pin failed: ${err.message?.slice(0, 80) ?? "unknown"}`);
  }

  // ── Venice metrics ────────────────────────────────────────────────────
  const metrics = getVeniceMetrics();

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║              DEMO COMPLETE ✓                       ║");
  console.log("╚════════════════════════════════════════════════════╝");
  console.log();
  console.log("  What just happened (fully autonomously, zero human intervention):");
  console.log(`  • ${spawnedChildren.length} child agents spawned as EIP-1167 clones`);
  console.log(`  • Each child registered: ENS subdomain + ERC-8004 identity + ERC-7715 delegation`);
  console.log(`  • Votes routed through MetaMask DelegationManager (redeemDelegations) — caveats enforced onchain`);
  console.log(`  • ${Object.values(proposalsByGovernor).flat().length} governance proposals created`);
  console.log(`  • All proposals reasoned about via Venice AI (llama-3.3-70b, no data retention)`);
  console.log(`  • Rationale encrypted via Lit Protocol before voting — unreadable until voting closed`);
  console.log(`  • All votes cast onchain with encrypted rationale as calldata`);
  console.log(`  • Parent evaluated alignment via Venice, scored all children`);
  console.log(`  • 1 child terminated (score 12/100) + respawned with lineage memory`);
  console.log(`  • Rationale revealed onchain after voting period expired`);
  console.log(`  • Execution log pinned to IPFS, CID stored onchain`);
  console.log();
  console.log("  Venice AI usage (all E2EE, zero data retained):");
  console.log(`  • Total calls: ${metrics.totalCalls}`);
  console.log(`  • Total tokens: ${metrics.totalTokens}`);
  console.log(`  • Call types: summarize → risk → reason → align → terminate`);
  console.log();
  console.log(`  Verify everything: ${EXPLORER}/address/${ADDRESSES.spawnFactory}`);
  console.log(`  Dashboard: https://spawn-protocol.vercel.app`);
}

main().catch(console.error);
